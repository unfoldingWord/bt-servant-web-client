import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom does not implement ResizeObserver; @assistant-ui/react's Viewport
// observes content size for auto-scroll. A no-op observer is enough for
// rendering — nothing under test depends on resize callbacks firing.
// Assigned directly (not via vi.stubGlobal) so a test file's
// vi.unstubAllGlobals() does not remove it between tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    ResizeObserverStub;
}

// jsdom also lacks Element.prototype.scrollTo, which the Viewport's
// auto-scroll calls from a MutationObserver callback after messages render.
if (typeof Element.prototype.scrollTo !== "function") {
  Element.prototype.scrollTo = () => {};
}

afterEach(() => {
  cleanup();
});
