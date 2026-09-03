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
   * from the moment `choose` is called. A pick whose write fails falls back
   * to the last hint the worker acknowledged. Never the chrome's fallback
   * locale.
   */
  responseLanguageHint: string | undefined;
  /**
   * The latest pick that has not reached the chrome yet — its `PUT` is in
   * flight, or `hold` is deferring the apply — and `null` otherwise. The
   * picker binds its radio to `pendingLocale ?? locale` so the control
   * shows what the user asked for, not what is applied: without it,
   * reselecting the original language during an in-flight pick is a
   * no-op against the already-checked value and the pick the user meant
   * to cancel lands anyway. A failed pick clears it with the hint.
   */
  pendingLocale: Locale | null;
  /**
   * Persists `locale` as the user's `response_language`, then applies it to
   * the chrome (through the same hold as the load: never under an animating
   * reply). Every write shares one chain, the first-visit seed included:
   * no PUT starts before the previous one has settled, and a seed or pick
   * that is no longer the latest intent by the time its turn comes is
   * skipped, so the last PUT sent is always the latest pick and the worker
   * cannot end up storing an older one — which is what lets a reselection
   * of the applied locale reverse a pick whose `PUT` is still in flight. A
   * load still in flight is superseded. Resolves when this pick's write has settled or been
   * skipped; never rejects. A failed write is logged with context and the
   * chrome, the picker and the hint fall back to the last state the worker
   * acknowledged (or, if nothing has been acknowledged yet, the mount-time
   * load runs again).
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
 * so it follows the user, queued on the same write chain as picks. Only
 * the mount whose `GET` came back empty writes; an aborted mount (unmount,
 * StrictMode's extra effect run) never does, and neither does a seed the
 * user's pick has already overtaken.
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
  // The latest pick that has not reached the chrome yet, so the picker can
  // show it and a reselection of the applied locale can reverse it.
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  // The mount-time load, so `choose` can cancel it; bumping the nonce runs
  // it again.
  const loadRef = useRef<AbortController | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);
  // The last state the worker acknowledged: what a `GET` reported, or what
  // a `PUT` stored. A failed pick falls back to this, never to the
  // optimistic value it replaced — a write that was overtaken before it
  // could apply may still have moved the worker on.
  const ackedHintRef = useRef<string | undefined>(undefined);
  const ackedLocaleRef = useRef<Locale | null>(null);
  const acknowledge = useCallback((acked: Locale, hint: string | undefined) => {
    ackedLocaleRef.current = acked;
    ackedHintRef.current = hint;
  }, []);
  // Picks are numbered so only the latest one writes and applies. Every
  // PUT (the first-visit seed included) runs one after another on this
  // chain. Aborting a fetch would not recall a PUT the server has already
  // received, so serialization, not cancellation, is what keeps storage at
  // the latest pick.
  const chooseGenerationRef = useRef(0);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  /** Appends `step` to the chain; a rejected step never stalls the next one. */
  const enqueueWrite = useCallback((step: () => Promise<void>) => {
    const next = writeChainRef.current.then(step, step);
    writeChainRef.current = next;
    return next;
  }, []);

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
          const hint =
            toResponseLanguage(preferred) === stored.response_language
              ? stored.response_language
              : undefined;
          acknowledge(preferred, hint);
          setResponseLanguageHint(hint);
        } else {
          const browser = getClientLocale();
          // Nothing stored: the browser code is what the worker will reply
          // in once the seed lands, and what it falls back to if it does not.
          acknowledge(browser, toResponseLanguage(browser));
          setResponseLanguageHint(toResponseLanguage(browser));
          // The seed joins the write chain so a slow seed can never land
          // after a pick and store the browser code over the user's intent.
          const generation = chooseGenerationRef.current;
          await enqueueWrite(async () => {
            // A pick that arrived before this step's turn made it moot.
            if (generation !== chooseGenerationRef.current) return;
            if (signal.aborted) return;
            // Deliberately not `signal`: `choose` aborts this controller,
            // and cancelling a PUT the server may already be processing
            // would release the chain while that write is still in the
            // air, letting the seed land after the pick after all.
            await saveLocalePreference(browser);
          });
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
  }, [enqueueWrite, acknowledge, loadNonce]);

  // Apply the loaded or chosen value once nothing is animating. Whatever
  // was pending has now reached the chrome, so the picker follows `locale`
  // again.
  useEffect(() => {
    if (loaded === null || hold) return;
    setLoaded(null);
    setPendingLocale(null);
    setLocale(loaded);
  }, [loaded, hold, setLocale]);

  const choose = useCallback(
    (next: Locale) => {
      // The user's pick supersedes a load still in flight or held: however
      // late its GET resolves, it must not revert what the user chose.
      loadRef.current?.abort();
      loadRef.current = null;
      const generation = ++chooseGenerationRef.current;
      setLoaded(null);
      setReady(true);
      setResponseLanguageHint(toResponseLanguage(next));
      setPendingLocale(next);

      const isLatest = () => generation === chooseGenerationRef.current;
      return enqueueWrite(async () => {
        // Coalesce: a newer pick arrived while an earlier write was in flight.
        if (!isLatest()) return;
        try {
          await saveLocalePreference(next);
          // The worker holds this now, even if a newer pick has overtaken
          // us and this step applies nothing.
          acknowledge(next, toResponseLanguage(next));
          if (!isLatest()) return; // its own step will write and apply
          // Through the apply effect, so a pick landing mid-reply waits too.
          setLoaded(next);
        } catch (error) {
          if (!isLatest()) {
            // The latest pick still writes and applies, so this is not the
            // user's problem — but a silent catch would hide a failing route.
            console.warn(
              "[LocalePreferenceProvider] an overtaken language write failed",
              { locale: next, error }
            );
            return;
          }
          const acked = ackedLocaleRef.current;
          setPendingLocale(null);
          if (acked === null) {
            // This pick superseded the mount-time load and then failed, so
            // nothing is known about what the worker holds. Run the load
            // again rather than leave a stored preference unapplied until
            // the next mount.
            setResponseLanguageHint(undefined);
            setLoadNonce((n) => n + 1);
          } else {
            // Fall back to what the worker last acknowledged, not to the
            // optimistic value this pick replaced, so the chrome, the
            // picker, the hint and storage all agree.
            setResponseLanguageHint(ackedHintRef.current);
            setLoaded(acked);
          }
          console.error(
            "[LocalePreferenceProvider] could not save the language preference; keeping the current locale",
            { locale: next, error }
          );
        }
      });
    },
    [enqueueWrite, acknowledge]
  );

  const value = useMemo<LocalePreferenceContextValue>(
    () => ({ locale, pendingLocale, ready, responseLanguageHint, choose }),
    [locale, pendingLocale, ready, responseLanguageHint, choose]
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
