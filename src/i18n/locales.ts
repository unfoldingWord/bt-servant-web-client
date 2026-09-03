import { en, type Dictionary } from "./en";
import { ptBR } from "./pt-BR";

interface LocaleEntry {
  dictionary: Dictionary;
  /** The language's name in itself, as the language picker shows it. */
  displayName: string;
  /**
   * BCP 47 primary language subtags (lower-case) that resolve to this locale
   * when no supported locale matches the full tag: `pt` covers `pt`, `pt-PT`,
   * `pt_br`, ... The worker stores bare ISO 639-1 codes, browsers send full
   * tags, so both shapes must land here. The first entry is also what the
   * client stores for this locale (`toResponseLanguage`).
   */
  primaries: readonly [string, ...string[]];
}

/**
 * The single registry of interface locales. `Locale`, `SUPPORTED_LOCALES`,
 * `t()` and `normalizeLocale()` are all derived from it, so adding a locale
 * is one dictionary file plus one entry here. See docs/i18n.md.
 */
export const LOCALES = {
  en: { dictionary: en, displayName: "English", primaries: ["en"] },
  "pt-BR": {
    dictionary: ptBR,
    displayName: "Português (Brasil)",
    primaries: ["pt"],
  },
} satisfies Record<string, LocaleEntry>;

export type Locale = keyof typeof LOCALES;

export const SUPPORTED_LOCALES = Object.keys(LOCALES) as readonly Locale[];

/** Rendered on the server and on the first client paint (hydration-safe). */
export const DEFAULT_LOCALE: Locale = "en";
