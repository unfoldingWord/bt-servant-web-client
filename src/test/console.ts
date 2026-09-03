import { expect, vi, type MockInstance } from "vitest";

// Console policy for the jsdom project, installed by vitest.setup.ts around
// every test. Product code logs on purpose (handleError, late SSE chunks,
// failed audio fetches) and jsdom reports unimplemented media APIs through
// console.error; all of it is captured instead of printed. A React warning —
// a state update outside act(), an <html> rendered under a <div>, or a legacy
// "Warning:"-prefixed message — fails the test.
const REACT_WARNING = /not wrapped in act|cannot be a child of|^Warning:/;

type Level = "error" | "warn" | "log" | "debug";
type ConsoleSpy = MockInstance<(...args: unknown[]) => void>;

/**
 * The active spies. Assert product logging through these, e.g.
 * `expect(consoleSpy.warn).toHaveBeenCalledWith("[sse] ...")`.
 */
export const consoleSpy = {} as Record<Level, ConsoleSpy>;

export function installConsolePolicy() {
  for (const level of ["error", "warn", "log", "debug"] as const) {
    consoleSpy[level] = vi.spyOn(console, level).mockImplementation(() => {});
  }
}

/** Restores the spies and fails the test if React warned. */
export function assertNoReactWarnings() {
  const warnings = [
    ...consoleSpy.error.mock.calls,
    ...consoleSpy.warn.mock.calls,
  ]
    .flat()
    .filter((a): a is string => typeof a === "string" && REACT_WARNING.test(a));
  for (const spy of Object.values(consoleSpy)) spy.mockRestore();
  expect(warnings).toEqual([]);
}
