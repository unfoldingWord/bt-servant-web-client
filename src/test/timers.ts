import { act } from "@testing-library/react";
import { vi } from "vitest";
import type { SSEEvent } from "@/types/engine";
import type { SseStream } from "./sse";

// Helpers for tests running under vi.useFakeTimers(). Each wraps the clock
// advance in act() so React state set from timers or promise chains is
// flushed before the caller asserts synchronously (RTL's waitFor cannot poll
// under vitest's fake timers).

/** Advances the fake clock, running due timers and the promise chains they resolve. */
export const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/** Lets pending promise chains settle without moving the clock. */
export const flush = () => advance(0);

/** Pushes one SSE frame and lets the reader loop process it. */
export const pushAndFlush = (stream: SseStream, event: SSEEvent) =>
  act(async () => {
    stream.push(event);
    await vi.advanceTimersByTimeAsync(0);
  });

/** Ends the stream and lets the reader loop observe the close. */
export const closeAndFlush = (stream: SseStream) =>
  act(async () => {
    stream.close();
    await vi.advanceTimersByTimeAsync(0);
  });

// ---------------------------------------------------------------------------
// Teardown. vitest runs afterEach hooks in stack order (default
// `sequence.hooks: "stack"`), so a test file's afterEach runs BEFORE the
// setup file's `cleanup()` + React-warning assertion. If the test file only
// restored real timers there, the unmount would happen later, under the real
// clock, and the hook's abort → catch → setState chain could land after the
// console spies were restored. `teardownMounted` fixes the order: it closes
// any open streams and unmounts inside act() while the test's clock (fake or
// real) is still installed, drains the resulting promise chains, and only
// then restores real timers.
// ---------------------------------------------------------------------------

export interface Mounted {
  /** RTL `render` / `renderHook` unmount. */
  unmount: () => void;
  /** Controllable streams the fake BFF opened for this mount, if any. */
  streams?: SseStream[];
}

let mounted: Mounted | null = null;

/** Records what the file-level `afterEach(teardownMounted)` must unmount. */
export function trackMount(next: Mounted) {
  mounted = next;
}

/**
 * Unmounts (and closes open streams) inside act(), under whatever clock the
 * test left installed, then restores real timers. Register it as the test
 * file's afterEach; the setup file's cleanup() then finds nothing left to do.
 */
export async function teardownMounted() {
  const current = mounted;
  mounted = null;
  try {
    if (current) {
      await act(async () => {
        current.unmount();
        for (const stream of current.streams ?? []) stream.close();
        if (vi.isFakeTimers()) {
          await vi.advanceTimersByTimeAsync(0);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      });
    }
  } finally {
    vi.useRealTimers();
  }
}
