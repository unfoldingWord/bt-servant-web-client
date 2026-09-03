import { vi } from "vitest";

// vitest.setup.ts makes HTMLMediaElement.prototype.play() reject with a
// NotSupportedError by default (jsdom has no media pipeline, and a rejection
// is what a browser without a decoder would produce), so useAudioPlayer's
// `.catch` is reachable in tests. Tests that need play() to succeed opt in.

/**
 * Makes `play()` resolve for the rest of the current test. The config's
 * `restoreMocks` puts the rejecting default back afterwards.
 */
export function allowMediaPlayback() {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
}
