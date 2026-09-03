import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { assertNoReactWarnings, installConsolePolicy } from "@/test/console";

// jsdom does not implement ResizeObserver; @assistant-ui/react's Viewport
// observes content size for auto-scroll. A no-op observer is enough for
// rendering — nothing under test depends on resize callbacks firing.
// Assigned directly (not via vi.stubGlobal) so `unstubGlobals` does not
// remove it between tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    ResizeObserverStub;
}

// jsdom also lacks Element.prototype.scrollTo, which the Viewport's
// auto-scroll calls from a MutationObserver callback after messages render.
if (typeof Element.prototype.scrollTo !== "function") {
  Element.prototype.scrollTo = () => {};
}

// ...and URL.createObjectURL / revokeObjectURL, which AudioPlayer uses to
// turn a fetched clip into an <audio> source. jsdom never loads media, so a
// stable placeholder URL is all the component needs.
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:vitest/audio";
  URL.revokeObjectURL = () => {};
}

// jsdom has no media pipeline: HTMLMediaElement's play()/pause()/load() only
// report "not implemented" through jsdom's virtual console, which bypasses
// the console spies below. They cannot be guarded with a `typeof` check like
// the polyfills above — jsdom does define them, as functions that hit the
// virtual console — so they are replaced unconditionally. pause()/load() are
// no-ops (useAudioPlayer calls pause() when it unmounts); play() rejects by
// default, as a browser with no decoder would, so useAudioPlayer's `.catch`
// is reachable. Opt in to a resolving play() with `allowMediaPlayback()`
// from src/test/media.ts.
HTMLMediaElement.prototype.play = () =>
  Promise.reject(
    new DOMException("The operation is not supported.", "NotSupportedError")
  );
HTMLMediaElement.prototype.pause = () => {};
HTMLMediaElement.prototype.load = () => {};

// React-warning policy: see src/test/console.ts.
beforeEach(installConsolePolicy);

afterEach(() => {
  // Unmount while the spies are still active: unmount-time effects (aborting
  // an open stream, releasing an <audio> element) log too.
  cleanup();
  assertNoReactWarnings();
});
