/**
 * Locales the interface can render. Adding a locale means: add a member
 * here, add it to SUPPORTED_LOCALES, add `src/i18n/<locale>.ts`, and register
 * it in `src/i18n/t.ts`. See docs/i18n.md.
 */
export type Locale = "en" | "pt-BR";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "pt-BR"] as const;

/** Rendered on the server and on the first client paint (hydration-safe). */
export const DEFAULT_LOCALE: Locale = "en";
