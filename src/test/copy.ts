// Copy fixture every UI test imports from. The dictionaries are the source of
// truth, re-exported here so a test never duplicates a string: an assertion
// reads `dict["thread.welcome"]`, and a wording change fails nowhere but in
// the dictionary and its parity test.
import type { Dictionary } from "@/i18n";

export {
  DEFAULT_LOCALE,
  LOCALES,
  SUPPORTED_LOCALES,
  en,
  ptBR,
  toResponseLanguage,
  type Dictionary,
  type Locale,
  type MessageKey,
} from "@/i18n";

/** The suggestion chips of `dict`, as `{ label, prompt }` in key order. */
export function chipsFor(dict: Dictionary) {
  return Object.keys(dict)
    .filter((k) => /^thread\.suggestion\..+\.label$/.test(k))
    .map((labelKey) => ({
      label: dict[labelKey as keyof Dictionary],
      prompt: dict[labelKey.replace(/label$/, "prompt") as keyof Dictionary],
    }));
}

// Not copy: unit labels are deliberately left untranslated (docs/i18n.md).
export const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
