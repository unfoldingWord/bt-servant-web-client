"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { MessageKey } from "./en";
import { normalizeLocale, t, type TranslationParams } from "./t";
import { DEFAULT_LOCALE, type Locale } from "./types";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

// The seed locale is read from two external, non-reactive sources
// (build-time env and the browser), so it is modelled as an external store:
// the server snapshot is always DEFAULT_LOCALE (hydration-safe) and the
// client snapshot is resolved once the component runs in a browser.
// Neither source changes during the page's lifetime, so subscribe is a no-op.
const subscribeToNothing = () => () => {};

function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

/**
 * `NEXT_PUBLIC_DEFAULT_LOCALE` (build-time; lets staging pin pt-BR) wins over
 * the browser's language.
 */
function getClientSnapshot(): Locale {
  const forced = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;
  if (forced) return normalizeLocale(forced);
  return normalizeLocale(
    typeof navigator === "undefined" ? undefined : navigator.language
  );
}

/**
 * Holds the interface locale. Server render and hydration use DEFAULT_LOCALE
 * so markup matches; the seed (env override, then navigator.language) takes
 * over on the client, and `<html lang>` follows every change. Later PRs only
 * need to call `setLocale` (e.g. from the `complete` SSE event) — no other
 * wiring.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const seeded = useSyncExternalStore(
    subscribeToNothing,
    getClientSnapshot,
    getServerSnapshot
  );
  const [override, setOverride] = useState<Locale | null>(null);
  const locale = override ?? seeded;

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setOverride(next);
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}

/** Returns `t` bound to the current locale. */
export function useT(): (
  key: MessageKey,
  params?: TranslationParams
) => string {
  const { locale } = useLocale();
  return useCallback(
    (key: MessageKey, params?: TranslationParams) => t(locale, key, params),
    [locale]
  );
}
