import type { MessageKey } from "./en";
import {
  DEFAULT_LOCALE,
  LOCALES,
  SUPPORTED_LOCALES,
  type Locale,
} from "./locales";

/**
 * Pure lookup for non-React code (the global error boundary, which renders
 * without a LocaleProvider). React code should use `useT()` from
 * `./locale-provider`. There is no missing-key branch: `MessageKey` and each
 * dictionary's `satisfies Dictionary` make a miss a compile error, and
 * `i18n.test.ts` checks parity at runtime.
 */
export function t(locale: Locale, key: MessageKey): string {
  return LOCALES[locale].dictionary[key];
}

/**
 * Maps any language tag the worker or browser may hand us onto a supported
 * Locale: canonicalize (trim, `_` → `-`, case-fold), then exact match, then
 * primary-subtag match via the registry, then `DEFAULT_LOCALE`. The
 * fallback applies to the chrome only; the reply language is unaffected.
 */
export function normalizeLocale(input: string | undefined | null): Locale {
  const tag = (input ?? "").trim().replace(/_/g, "-").toLowerCase();
  if (!tag) return DEFAULT_LOCALE;

  const exact = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === tag);
  if (exact) return exact;

  const primary = tag.split("-")[0];
  const byPrimary = SUPPORTED_LOCALES.find((l) =>
    LOCALES[l].primaries.includes(primary)
  );
  return byPrimary ?? DEFAULT_LOCALE;
}

/**
 * The locale known before any browser signal — what the server renders,
 * the client hydrates with, and the global error boundary shows:
 * `NEXT_PUBLIC_DEFAULT_LOCALE` (build-time; inlined into both bundles, so
 * both sides agree) or `DEFAULT_LOCALE`. Used for `<html lang>` in the root
 * layout and as the provider's server snapshot.
 */
export function getInitialLocale(): Locale {
  return normalizeLocale(process.env.NEXT_PUBLIC_DEFAULT_LOCALE);
}
