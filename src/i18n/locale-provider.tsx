"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { MessageKey } from "./en";
import { getInitialLocale, normalizeLocale, t } from "./t";
import type { Locale } from "./locales";

export type Translate = (key: MessageKey) => string;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** `t` bound to `locale`; one function per locale change, shared by all consumers. */
  t: Translate;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

// The seed locale is read from two external, non-reactive sources
// (build-time env and the browser), so it is modelled as an external store.
// The server snapshot is also what the client hydrates with, so it must be
// computable on both sides: the env pin is inlined into both bundles,
// navigator is not. Neither source changes during the page's lifetime, so
// subscribe is a no-op.
const subscribeToNothing = () => () => {};

/**
 * The locale the browser resolves to once hydrated: `NEXT_PUBLIC_DEFAULT_LOCALE`
 * (lets staging pin pt-BR) wins over `navigator.language`. Client only. Also
 * what the preference provider seeds from, read at PUT time, because during
 * hydration React state may still hold the server snapshot.
 */
export function getClientLocale(): Locale {
  return process.env.NEXT_PUBLIC_DEFAULT_LOCALE
    ? getInitialLocale()
    : normalizeLocale(navigator.language);
}

/**
 * Holds the interface locale. Server render and hydration use the server
 * locale so markup matches; the browser's language takes over after
 * hydration when nothing is pinned, and `<html lang>` follows every change
 * before paint. `LocalePreferenceProvider` is the only caller of `setLocale`
 * for the stored language; do not drive it from the `complete` SSE event.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const seeded = useSyncExternalStore(
    subscribeToNothing,
    getClientLocale,
    getInitialLocale
  );
  const [override, setOverride] = useState<Locale | null>(null);
  const locale = override ?? seeded;

  // Layout effect, not effect: the lang attribute must change in the same
  // frame as the text it describes, never a paint later.
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: setOverride,
      t: (key) => t(locale, key),
    }),
    [locale]
  );

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
export function useT(): Translate {
  return useLocale().t;
}
