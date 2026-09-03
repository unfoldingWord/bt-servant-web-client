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
