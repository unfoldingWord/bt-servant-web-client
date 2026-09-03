import { en, type MessageKey } from "./en";
import { ptBR } from "./pt-BR";
import { DEFAULT_LOCALE, type Locale } from "./types";

export type TranslationParams = Record<string, string | number>;

// Register every locale here. `Record<Locale, ...>` makes a new Locale union
// member without a dictionary a compile error.
const dictionaries: Record<Locale, Record<MessageKey, string>> = {
  en,
  "pt-BR": ptBR,
};

/**
 * Replaces `{name}` placeholders with `params[name]`. Placeholders with no
 * matching param are left in place so a missing value is visible, not
 * silently blanked.
 */
export function interpolate(
  template: string,
  params: TranslationParams | undefined
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

/**
 * Pure lookup for non-React code (e.g. the runtime hook's error strings).
 * React code should use `useT()` from `./locale-provider`.
 *
 * Missing key: throws outside production so the gap is caught in
 * development and tests; returns the key itself in production so the UI
 * degrades to a readable identifier rather than crashing.
 */
export function t(
  locale: Locale,
  key: MessageKey,
  params?: TranslationParams
): string {
  const dictionary = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  const value: string | undefined = dictionary[key];
  if (value === undefined) {
    if (process.env.NODE_ENV !== "production") {
      throw new Error(`[i18n] Missing key "${key}" for locale "${locale}"`);
    }
    return key;
  }
  return interpolate(value, params);
}

/**
 * Maps any language tag the worker or browser may hand us onto a supported
 * Locale. The worker stores ISO 639-1 (`pt`); browsers send BCP 47
 * (`pt-BR`, `en-US`). Matching is case-insensitive on the primary subtag and
 * accepts `_` as a separator. Anything unsupported falls back to `en` — for
 * the chrome only; the reply language is unaffected.
 */
export function normalizeLocale(input: string | undefined | null): Locale {
  if (!input) return DEFAULT_LOCALE;
  const primary = input.trim().toLowerCase().split(/[-_]/)[0];
  switch (primary) {
    case "pt":
      return "pt-BR";
    case "en":
      return "en";
    default:
      return DEFAULT_LOCALE;
  }
}
