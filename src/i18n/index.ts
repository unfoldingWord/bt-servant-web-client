// Public surface of the i18n layer. Import from `@/i18n`, not from the
// submodules; only the src/i18n tests reach into them directly.
export { en, type Dictionary, type MessageKey } from "./en";
export { ptBR } from "./pt-BR";
export {
  DEFAULT_LOCALE,
  LOCALES,
  SUPPORTED_LOCALES,
  type Locale,
} from "./locales";
export { getInitialLocale, normalizeLocale, t, toResponseLanguage } from "./t";
export {
  getClientLocale,
  LocaleProvider,
  useLocale,
  useT,
  type Translate,
} from "./locale-provider";
