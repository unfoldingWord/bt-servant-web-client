import { describe, expect, it } from "vitest";
import { BYTE_UNITS } from "@/test/copy";
import { formatBytes, hasVisibleText } from "./utils";

const [B, KB, MB, GB, TB] = BYTE_UNITS;

describe("formatBytes", () => {
  it("renders bytes below 1 KiB without rounding", () => {
    expect(formatBytes(0)).toBe(`0 ${B}`);
    expect(formatBytes(1)).toBe(`1 ${B}`);
    expect(formatBytes(1023)).toBe(`1023 ${B}`);
  });

  it("steps through binary units and rounds to one decimal", () => {
    expect(formatBytes(1024)).toBe(`1 ${KB}`);
    expect(formatBytes(1536)).toBe(`1.5 ${KB}`);
    expect(formatBytes(1024 * 1024)).toBe(`1 ${MB}`);
    expect(formatBytes(2.25 * 1024 * 1024)).toBe(`2.3 ${MB}`);
    expect(formatBytes(1024 ** 3)).toBe(`1 ${GB}`);
    expect(formatBytes(1024 ** 4)).toBe(`1 ${TB}`);
  });

  it("caps at TB rather than inventing a larger unit", () => {
    expect(formatBytes(1024 ** 5)).toBe(`1024 ${TB}`);
  });

  it("returns 0 B for negative or non-finite input", () => {
    expect(formatBytes(-1)).toBe(`0 ${B}`);
    expect(formatBytes(Number.NaN)).toBe(`0 ${B}`);
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe(`0 ${B}`);
  });
});

describe("hasVisibleText", () => {
  it("treats whitespace-only streamed text as nothing visible", () => {
    // The worker's inter-iteration separator, and the shapes around it.
    expect(hasVisibleText("")).toBe(false);
    expect(hasVisibleText("\n")).toBe(false);
    expect(hasVisibleText("\n\n")).toBe(false);
    expect(hasVisibleText(" \t\n ")).toBe(false);
  });

  it("is true as soon as one non-whitespace character has streamed", () => {
    expect(hasVisibleText("Bem")).toBe(true);
    expect(hasVisibleText("\nBem")).toBe(true);
    expect(hasVisibleText(" .")).toBe(true);
  });
});
