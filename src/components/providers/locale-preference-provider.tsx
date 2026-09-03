"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getClientLocale,
  normalizeLocale,
  toResponseLanguage,
  useLocale,
  type Locale,
} from "@/i18n";
import type { UserPreferences } from "@/types/engine";

// One coupled setting: the interface locale and the model's reply language
// are the same preference, stored by the worker as `response_language`
// (ISO 639-1, e.g. `pt`) and proxied by the BFF at /api/preferences. This
// provider is its only writer and the only caller of `setLocale` for it.

const PREFERENCES_URL = "/api/preferences";

interface LocalePreferenceContextValue {
  locale: Locale;
  /**
   * True once the mount-time load has settled: the stored value delivered
   * (applied, or held while `hold` is true), the browser locale seeded, the
   * request failed, or `choose` superseded it. Nothing waits on it today
   * (the worker replies in the persisted language regardless); it is exposed
   * for views that want to know.
   */
  ready: boolean;
  /**
   * What every chat request should carry as `response_language_hint`:
   * `undefined` while the load is in flight or when the stored code is not
   * one this client knows (absent = the worker uses what it has stored), the
   * browser-derived code once an empty GET has come back (the seed PUT may
   * still be pending), the stored code after a stored GET, the chosen code
   * from the moment `choose` is called. Never the chrome's fallback locale.
   */
  responseLanguageHint: string | undefined;
  /**
   * Persists `locale` as the user's `response_language`, then applies it to
   * the chrome (through the same hold as the load: never under an animating
   * reply). Writes are serialized: no PUT starts before the previous one has
   * settled, and a pick that is no longer the latest by the time its turn
   * comes is skipped, so the last PUT sent is always the latest pick and the
   * worker cannot end up storing an older one. A load still in flight is
   * superseded. Resolves when this pick's write has settled or been
   * skipped; never rejects (a failed write is logged with context and the
   * current locale stays).
   */
  choose: (locale: Locale) => Promise<void>;
}

const LocalePreferenceContext =
  createContext<LocalePreferenceContextValue | null>(null);

async function readPreferences(signal: AbortSignal): Promise<UserPreferences> {
  const response = await fetch(PREFERENCES_URL, { signal });
  if (!response.ok) {
    throw new Error(`GET ${PREFERENCES_URL} failed (${response.status})`);
  }
  return response.json();
}

/**
 * The one `PUT`: persists `locale` as the user's `response_language`
 * (`toResponseLanguage`, ISO 639-1). Rejects on a non-2xx answer.
 */
export async function saveLocalePreference(
  locale: Locale,
  signal?: AbortSignal
): Promise<void> {
  const body: UserPreferences = {
    response_language: toResponseLanguage(locale),
  };
  const response = await fetch(PREFERENCES_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw new Error(`PUT ${PREFERENCES_URL} failed (${response.status})`);
  }
}

/**
 * Owns the stored language preference for the authenticated area (the BFF
 * route needs a session). Mounted once by `AssistantProvider`.
 *
 * On mount it runs one load: `GET` the preference; a stored value is applied
 * with `setLocale(normalizeLocale(it))` (an explicit choice beats the
 * browser; an unsupported code falls back to the default locale for the
 * chrome only); nothing stored means a first visit on any device, and the
 * browser's locale (`getClientLocale()`, read at PUT time: during hydration
 * React state may still hold the server snapshot) is seeded with one `PUT`
 * so it follows the user. Only the mount whose `GET` came back empty writes;
 * an aborted mount (unmount, StrictMode's extra effect run) never does.
 * Failures are logged with `console.error` and context and leave the browser
 * locale in place.
 *
 * `hold` (a reply is in flight) defers applying a loaded value: the chrome
 * never flips under an animating reply, and the value lands as soon as
 * `hold` turns false. `choose` is the user's explicit pick from the language
 * picker; see the context type. See docs/i18n.md, "The language preference".
 */
export function LocalePreferenceProvider({
  hold = false,
  onResponseLanguageHintChange,
  children,
}: {
  hold?: boolean;
  /**
   * Reports `responseLanguageHint` upward for the component that owns the
   * chat runtime and renders this provider (`AssistantProvider`), which
   * cannot read the context from above.
   */
  onResponseLanguageHintChange?: (hint: string | undefined) => void;
  children: ReactNode;
}) {
  const { locale, setLocale } = useLocale();
  const [ready, setReady] = useState(false);
  const [responseLanguageHint, setResponseLanguageHint] = useState<
    string | undefined
  >(undefined);
  // What the load or a pick delivered and has not applied yet (held, or one
  // render away from applying).
  const [loaded, setLoaded] = useState<Locale | null>(null);
  // The mount-time load, so `choose` can cancel it.
  const loadRef = useRef<AbortController | null>(null);
  // Picks are numbered so only the latest one writes and applies; their
  // PUTs run one after another on this chain. Aborting a fetch would not
  // recall a PUT the server has already received, so serialization, not
  // cancellation, is what keeps storage at the latest pick.
  const chooseGenerationRef = useRef(0);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    onResponseLanguageHintChange?.(responseLanguageHint);
  }, [responseLanguageHint, onResponseLanguageHintChange]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    loadRef.current = controller;

    (async () => {
      try {
        const stored = await readPreferences(signal);
        if (signal.aborted) return;

        if (stored.response_language) {
          const preferred = normalizeLocale(stored.response_language);
          setLoaded(preferred);
          // Hint only with a code this client knows; an unsupported stored
          // code falls back to the default locale for the chrome alone, and
          // the worker keeps replying in what it has stored.
          setResponseLanguageHint(
            toResponseLanguage(preferred) === stored.response_language
              ? stored.response_language
              : undefined
          );
        } else {
          const browser = getClientLocale();
          setResponseLanguageHint(toResponseLanguage(browser));
          await saveLocalePreference(browser, signal);
        }
      } catch (error) {
        // Superseded by `choose` or unmounted mid-flight: nothing to report.
        if (signal.aborted) return;
        console.error(
          "[LocalePreferenceProvider] could not sync response_language; keeping the browser locale",
          { locale: getClientLocale(), error }
        );
      } finally {
        if (!signal.aborted) setReady(true);
      }
    })();

    return () => controller.abort();
  }, []);

  // Apply the loaded or chosen value once nothing is animating.
  useEffect(() => {
    if (loaded === null || hold) return;
    setLoaded(null);
    setLocale(loaded);
  }, [loaded, hold, setLocale]);

  const choose = useCallback((next: Locale) => {
    // The user's pick supersedes a load still in flight or held: however
    // late its GET resolves, it must not revert what the user chose.
    loadRef.current?.abort();
    loadRef.current = null;
    const generation = ++chooseGenerationRef.current;
    setLoaded(null);
    setReady(true);
    setResponseLanguageHint(toResponseLanguage(next));

    const isLatest = () => generation === chooseGenerationRef.current;
    const write = async () => {
      // Coalesce: a newer pick arrived while an earlier write was in flight.
      if (!isLatest()) return;
      try {
        await saveLocalePreference(next);
        if (!isLatest()) return; // its own step will write and apply
        // Through the apply effect, so a pick landing mid-reply waits too.
        setLoaded(next);
      } catch (error) {
        if (!isLatest()) return;
        console.error(
          "[LocalePreferenceProvider] could not save the language preference; keeping the current locale",
          { locale: next, error }
        );
      }
    };
    const step = writeChainRef.current.then(write);
    writeChainRef.current = step;
    return step;
  }, []);

  const value = useMemo<LocalePreferenceContextValue>(
    () => ({ locale, ready, responseLanguageHint, choose }),
    [locale, ready, responseLanguageHint, choose]
  );

  return (
    <LocalePreferenceContext.Provider value={value}>
      {children}
    </LocalePreferenceContext.Provider>
  );
}

export function useLocalePreference(): LocalePreferenceContextValue {
  const ctx = useContext(LocalePreferenceContext);
  if (!ctx) {
    throw new Error(
      "useLocalePreference must be used within a LocalePreferenceProvider"
    );
  }
  return ctx;
}
