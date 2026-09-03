import { afterEach, describe, expect, it, vi } from "vitest";
import { en, type MessageKey } from "./en";
import { ptBR } from "./pt-BR";
import { interpolate, normalizeLocale, t } from "./t";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./types";

// Values that are legitimately identical across locales (proper nouns).
// Any other pt-BR value that is byte-identical to its English source is an
// untranslated key and fails the parity check below.
const IDENTICAL_VALUE_ALLOWLIST = new Set<string>(["BT Servant"]);

const enKeys = Object.keys(en).sort();
const ptKeys = Object.keys(ptBR).sort();

describe("dictionary parity", () => {
  it("every en key exists in pt-BR and vice versa", () => {
    expect(ptKeys).toEqual(enKeys);
  });

  it("supports exactly the locales declared in the Locale union", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "pt-BR"]);
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("has no empty values in either dictionary", () => {
    for (const key of enKeys as MessageKey[]) {
      expect(en[key].trim(), `en.${key}`).not.toBe("");
      expect(ptBR[key].trim(), `pt-BR.${key}`).not.toBe("");
    }
  });

  it("has no pt-BR value byte-identical to en outside the proper-noun allow-list", () => {
    const untranslated = (enKeys as MessageKey[]).filter(
      (key) => ptBR[key] === en[key] && !IDENTICAL_VALUE_ALLOWLIST.has(en[key])
    );
    expect(untranslated).toEqual([]);
  });

  it("keeps the same {param} placeholders in both languages", () => {
    const placeholders = (s: string) =>
      [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of enKeys as MessageKey[]) {
      expect(placeholders(ptBR[key]), key).toEqual(placeholders(en[key]));
    }
  });
});

describe("t()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the value for the requested locale", () => {
    expect(t("en", "thread.welcome")).toBe(en["thread.welcome"]);
    expect(t("pt-BR", "thread.welcome")).toBe(ptBR["thread.welcome"]);
    expect(t("pt-BR", "thread.welcome")).not.toBe(en["thread.welcome"]);
  });

  it("interpolates {param} placeholders and leaves unknown ones in place", () => {
    expect(interpolate("Hello {name}, {name}!", { name: "Ana" })).toBe(
      "Hello Ana, Ana!"
    );
    expect(interpolate("{count} files", { count: 3 })).toBe("3 files");
    expect(interpolate("Keep {this}", {})).toBe("Keep {this}");
    expect(interpolate("No params", undefined)).toBe("No params");
  });

  it("passes params through to interpolation", () => {
    // No shipped key carries a placeholder today; a key without one must be
    // returned unchanged when params are supplied.
    expect(t("en", "thread.welcome", { unused: "x" })).toBe(
      en["thread.welcome"]
    );
  });

  it("throws on a missing key outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => t("en", "nope.missing" as MessageKey)).toThrow(
      /nope\.missing/
    );
  });

  it("returns the key on a missing key in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(t("pt-BR", "nope.missing" as MessageKey)).toBe("nope.missing");
  });
});

describe("normalizeLocale()", () => {
  it.each([
    ["pt", "pt-BR"],
    ["pt-BR", "pt-BR"],
    ["PT-br", "pt-BR"],
    ["pt_BR", "pt-BR"],
    ["pt-PT", "pt-BR"],
    ["en", "en"],
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
