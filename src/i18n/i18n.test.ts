import { describe, expect, it, vi } from "vitest";
import { en, type MessageKey } from "./en";
import { DEFAULT_LOCALE, LOCALES, SUPPORTED_LOCALES } from "./locales";
import { getInitialLocale, normalizeLocale, t } from "./t";

// Values that are legitimately identical across locales (proper nouns).
// Any other value that is byte-identical to its English source is an
// untranslated key and fails the parity check below.
const IDENTICAL_VALUE_ALLOWLIST = new Set<string>(["BT Servant"]);

const enKeys = Object.keys(en).sort() as MessageKey[];
const OTHER_LOCALES = SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE);

describe("locale registry", () => {
  it("derives SUPPORTED_LOCALES from the registry and includes the default", () => {
    expect(SUPPORTED_LOCALES).toEqual(Object.keys(LOCALES));
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
    expect(LOCALES[DEFAULT_LOCALE].dictionary).toBe(en);
  });

  it("gives every locale at least one lower-case primary subtag, none shared", () => {
    const seen = new Set<string>();
    for (const locale of SUPPORTED_LOCALES) {
      const { primaries } = LOCALES[locale];
      expect(primaries.length, locale).toBeGreaterThan(0);
      for (const p of primaries) {
        expect(p, `${locale}: ${p}`).toBe(p.toLowerCase());
        expect(seen.has(p), `${p} claimed twice`).toBe(false);
        seen.add(p);
      }
    }
  });

  // One literal anchor for the whole suite: the default locale renders
  // English copy, not keys. Every other string assertion reads the dictionary.
  it("renders English copy, not keys, in the default locale", () => {
    expect(t(DEFAULT_LOCALE, "thread.welcome")).toBe(
      "Hello, I'm BT Servant. How can I serve you today?"
    );
  });
});

describe.each(OTHER_LOCALES)("dictionary parity: %s", (locale) => {
  const dict = LOCALES[locale].dictionary;

  it("has exactly the en keys", () => {
    expect(Object.keys(dict).sort()).toEqual(enKeys);
  });

  it("has no empty values", () => {
    for (const key of enKeys) {
      expect(dict[key].trim(), key).not.toBe("");
    }
  });

  it("has no value byte-identical to en outside the proper-noun allow-list", () => {
    const untranslated = enKeys.filter(
      (key) => dict[key] === en[key] && !IDENTICAL_VALUE_ALLOWLIST.has(en[key])
    );
    expect(untranslated).toEqual([]);
  });

  it("t() returns this locale's value, not English", () => {
    expect(t(locale, "thread.welcome")).toBe(dict["thread.welcome"]);
    expect(t(locale, "thread.welcome")).not.toBe(en["thread.welcome"]);
  });
});

describe("normalizeLocale()", () => {
  it.each([
    ["pt", "pt-BR"],
    ["pt-BR", "pt-BR"],
    ["PT-br", "pt-BR"],
    ["pt_BR", "pt-BR"],
    ["pt-PT", "pt-BR"],
    [" pt-BR ", "pt-BR"],
    ["pt-br", "pt-BR"],
    ["pt-BR-x-foo", "pt-BR"],
    ["en", "en"],
    ["en_GB", "en"],
    ["en-US", "en"],
    ["EN", "en"],
    ["es", "en"],
    ["xx", "en"],
    ["", "en"],
    ["  ", "en"],
    [undefined, "en"],
    [null, "en"],
  ] as const)("normalizeLocale(%j) → %s", (input, expected) => {
    expect(normalizeLocale(input)).toBe(expected);
  });
});

describe("getInitialLocale()", () => {
  it.each([
    [undefined, "en"],
    ["", "en"],
    ["pt", "pt-BR"],
    ["pt-BR", "pt-BR"],
    ["xx", "en"],
  ])("NEXT_PUBLIC_DEFAULT_LOCALE=%j → %s", (env, expected) => {
    if (env === undefined) vi.stubEnv("NEXT_PUBLIC_DEFAULT_LOCALE", undefined);
    else vi.stubEnv("NEXT_PUBLIC_DEFAULT_LOCALE", env);
    expect(getInitialLocale()).toBe(expected);
  });
});
