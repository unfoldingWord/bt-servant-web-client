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
   * True once the mount-time load has settled: the stored value applied, the
   * browser locale seeded, the request failed, or `choose` superseded it.
   * Nothing waits on it today (the worker replies in the persisted language
   * regardless); it is exposed for views that want to know.
   */
  ready: boolean;
  /**
   * Persists `locale` as the user's `response_language`, then applies it to
   * the chrome. A load still in flight is superseded, so its result can never
   * revert the choice. Never rejects: a failed write is logged with context
   * and the current locale stays.
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
 * browser-derived locale is seeded with one `PUT` so it follows the user.
 * Only the mount whose `GET` came back empty writes; an aborted mount
 * (unmount, StrictMode's extra effect run) never does. Failures are logged
 * with `console.error` and context and leave the browser locale in place.
 *
 * `choose` is the user's explicit pick from the language picker; see the
 * context type. See docs/i18n.md, "The language preference".
 */
export function LocalePreferenceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { locale, setLocale } = useLocale();
  const [ready, setReady] = useState(false);
  // Read at PUT time, not at mount: during hydration the provider may still
  // be on its server snapshot when the effect first runs, and the browser
  // locale only lands on the following render.
  const localeRef = useRef(locale);
  // The mount-time load, so `choose` can cancel it.
  const loadRef = useRef<AbortController | null>(null);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    loadRef.current = controller;

    (async () => {
      try {
        const stored = await readPreferences(signal);
        if (signal.aborted) return;

        if (stored.response_language) {
          setLocale(normalizeLocale(stored.response_language));
        } else {
          await saveLocalePreference(localeRef.current, signal);
        }
      } catch (error) {
        // Superseded by `choose` or unmounted mid-flight: nothing to report.
        if (signal.aborted) return;
        console.error(
          "[LocalePreferenceProvider] could not sync response_language; keeping the browser locale",
          { locale: localeRef.current, error }
        );
      } finally {
        if (!signal.aborted) setReady(true);
      }
    })();

    return () => controller.abort();
  }, [setLocale]);

  const choose = useCallback(
    async (next: Locale) => {
      // The user's pick supersedes a load still in flight: however late its
      // GET resolves, it must not revert what the user just chose.
      loadRef.current?.abort();
      loadRef.current = null;
      setReady(true);
      try {
        await saveLocalePreference(next);
        setLocale(next);
      } catch (error) {
        console.error(
          "[LocalePreferenceProvider] could not save the language preference; keeping the current locale",
          { locale: next, error }
        );
      }
    },
    [setLocale]
  );

  const value = useMemo<LocalePreferenceContextValue>(
    () => ({ locale, ready, choose }),
    [locale, ready, choose]
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
