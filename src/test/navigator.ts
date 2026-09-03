import { vi } from "vitest";

/**
 * Overrides `navigator.language` for the current test. jsdom exposes it as a
 * prototype getter ("en-US"); the spy shadows it on the instance and is
 * removed by the config's `restoreMocks`, so no manual cleanup is needed.
 */
export function stubNavigatorLanguage(value: string) {
  vi.spyOn(window.navigator, "language", "get").mockReturnValue(value);
}
