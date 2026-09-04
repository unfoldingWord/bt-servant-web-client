import { en, type Dictionary } from "./en";
import { ptBR } from "./pt-BR";

interface LocaleEntry {
  dictionary: Dictionary;
  /**
   * BCP 47 primary language subtags (lower-case) that resolve to this locale
   * when no supported locale matches the full tag: `pt` covers `pt`, `pt-PT`,
   * `pt_br`, ... The worker stores bare ISO 639-1 codes, browsers send full
   * tags, so both shapes must land here.
   */
  primaries: readonly string[];
}

/**
 * The single registry of interface locales. `Locale`, `SUPPORTED_LOCALES`,
 * `t()` and `normalizeLocale()` are all derived from it, so adding a locale
 * is one dictionary file plus one entry here. See docs/i18n.md.
 */
export const LOCALES = {
  en: { dictionary: en, primaries: ["en"] },
  "pt-BR": { dictionary: ptBR, primaries: ["pt"] },
} satisfies Record<string, LocaleEntry>;

export type Locale = keyof typeof LOCALES;

export const SUPPORTED_LOCALES = Object.keys(LOCALES) as readonly Locale[];

/** Rendered on the server and on the first client paint (hydration-safe). */
export const DEFAULT_LOCALE: Locale = "en";
