import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { consoleSpy } from "@/test/console";
import { CONNECTING, CONNECTION_LOST, FALLBACK_ERROR } from "@/test/copy";
import { installFakeBff, type FakeBffOptions } from "@/test/fake-bff";
import { completeEvent } from "@/test/fixtures";
import { advance, closeAndFlush, pushAndFlush } from "@/test/timers";
import { useChatRuntime } from "./use-chat-runtime";

// The literal the hook stores for a voice turn with no transcript. Kept local
// on purpose: the test's point is the literal, not a shared constant.
const VOICE_SENTINEL = "[Voice message]";

type Runtime = ReturnType<typeof useChatRuntime>;
type Result = { current: Runtime };
type SendArgs = Parameters<Runtime["sendMessage"]>;

const lastMessage = (result: Result) => result.current.messages.at(-1)!;
const assistantMessages = (result: Result) =>
  result.current.messages.filter((m) => m.role === "assistant");
const textOf = (message: Runtime["messages"][number]) =>
  message.content[0]?.text ?? "";

// Set by mountRuntime. Unmounting inside act, under whatever clock the test
// left installed, runs the hook's abort → catch → finally path so an open
// stream and its 5s inactivity interval are torn down deterministically,
// before the fetch stub goes away.
let unmountRuntime: (() => void) | null = null;

afterEach(async () => {
  const unmount = unmountRuntime;
  unmountRuntime = null;
  if (unmount) {
    await act(async () => {
      unmount();
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
    });
  }
  vi.useRealTimers();
});

/**
 * Renders the hook and lets the mount-time history load settle on real
 * timers, mirroring real usage where history resolves long before the user
 * sends anything.
 */
async function mountRuntime(opts?: FakeBffOptions) {
  const harness = installFakeBff(opts);
  const { result, unmount } = renderHook(() => useChatRuntime());
  unmountRuntime = unmount;
  await harness.historyLoaded();
  return { harness, result };
}

/**
 * Mounts, freezes the clock, sends `message` and returns the SSE stream the
 * hook opened. Everything after this runs under fake timers: events are
 * pushed with `pushAndFlush`, time passes with `advance`, and assertions are
 * synchronous.
 */
async function startStream(opts?: FakeBffOptions, message: SendArgs = ["hi"]) {
  const { harness, result } = await mountRuntime(opts);
  vi.useFakeTimers();
  await act(async () => {
    void result.current.sendMessage(...message);
    await vi.advanceTimersByTimeAsync(0);
  });
  const stream = harness.streams.at(-1);
  expect(stream).toBeDefined();
  return { harness, result, stream: stream! };
}

// ---------------------------------------------------------------------------

describe("useChatRuntime — SSE event handling", () => {
  it("shows 'Connecting...' once the stream opens, then the status event text", async () => {
    const { result, stream } = await startStream();

    expect(result.current.isLoading).toBe(true);
    expect(result.current.statusMessage).toBe(CONNECTING);

    await pushAndFlush(stream, { type: "status", message: "Looking up Amos" });
    expect(result.current.statusMessage).toBe("Looking up Amos");
  });

  it("accumulates progress chunks into streamingText in arrival order", async () => {
    const { result, stream } = await startStream();

    await pushAndFlush(stream, { type: "progress", text: "Amos " });
    await pushAndFlush(stream, { type: "progress", text: "was a " });
    await pushAndFlush(stream, { type: "progress", text: "shepherd." });

    expect(result.current.streamingText).toBe("Amos was a shepherd.");

    // The synthetic streaming message is appended to the visible list.
    const last = lastMessage(result);
    expect(last.isStreaming).toBe(true);
    expect(textOf(last)).toBe("Amos was a shepherd.");
  });

  it("complete with no prior progress appends one assistant message joined with \\n\\n and clears status/loading", async () => {
    const { result, stream } = await startStream();

    await pushAndFlush(stream, { type: "status", message: "Thinking" });
    expect(result.current.statusMessage).toBe("Thinking");

    await pushAndFlush(stream, completeEvent(["First part.", "Second part."]));

    expect(result.current.isLoading).toBe(false);
    const assistant = assistantMessages(result);
    expect(assistant).toHaveLength(1);
    expect(textOf(assistant[0])).toBe("First part.\n\nSecond part.");
    expect(assistant[0].isStreaming).toBeUndefined();
    expect(result.current.statusMessage).toBeNull();
    expect(result.current.streamingText).toBe("");
  });

  it("complete after progress defers the swap until finalizeComplete, then leaves exactly one assistant message", async () => {
    const { result, stream } = await startStream();

    await pushAndFlush(stream, { type: "progress", text: "First part." });
    expect(result.current.streamingText).toBe("First part.");

    await pushAndFlush(stream, completeEvent(["First part.", "Second part."]));

    // Deferred: streamingText becomes the full joined response and the hook
    // reports isCompleting so AnimatedText can catch up.
    expect(result.current.isCompleting).toBe(true);
    expect(result.current.streamingText).toBe("First part.\n\nSecond part.");
    expect(result.current.statusMessage).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(lastMessage(result).isStreaming).toBe(true);

    // Invariant (docs/streaming-animation.md #2): a straggling progress chunk
    // after the terminal event must not mutate streamingText. The hook's own
    // warning proves the chunk was seen and dropped, not merely unread.
    await pushAndFlush(stream, { type: "progress", text: "STRAGGLER" });
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      "[sse] ignoring late progress chunk after terminal event"
    );
    expect(result.current.streamingText).toBe("First part.\n\nSecond part.");

    act(() => result.current.finalizeComplete());

    expect(result.current.isLoading).toBe(false);
    const assistant = assistantMessages(result);
    expect(assistant).toHaveLength(1);
    expect(textOf(assistant[0])).toBe("First part.\n\nSecond part.");
    expect(assistant[0].isStreaming).toBeUndefined();
    expect(result.current.isCompleting).toBe(false);
    expect(result.current.streamingText).toBe("");
  });

  it("error event appends the canned fallback (never the raw worker text) and clears loading", async () => {
    const { result, stream } = await startStream();

    await pushAndFlush(stream, { type: "progress", text: "partial" });
    expect(result.current.streamingText).toBe("partial");

    const rawWorkerError =
      '{"error":{"type":"overloaded_error","message":"Overloaded"}}';
    await pushAndFlush(stream, { type: "error", error: rawWorkerError });

    expect(result.current.isLoading).toBe(false);
    const last = lastMessage(result);
    expect(last.role).toBe("assistant");
    expect(textOf(last)).toBe(FALLBACK_ERROR);
    expect(textOf(last)).not.toContain("overloaded_error");
    expect(result.current.statusMessage).toBeNull();
    expect(result.current.streamingText).toBe("");
    expect(result.current.isCompleting).toBe(false);
  });

  it("a non-2xx stream response also yields the canned fallback", async () => {
    const { result } = await mountRuntime({
      onStream: () => new Response("upstream exploded", { status: 502 }),
    });

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(result.current.isLoading).toBe(false);
    const last = lastMessage(result);
    expect(last.role).toBe("assistant");
    expect(textOf(last)).toBe(FALLBACK_ERROR);
    expect(textOf(last)).not.toContain("upstream exploded");
  });

  it("a stream that closes without a terminal event yields the connection-lost message", async () => {
    const { result, stream } = await startStream();

    await pushAndFlush(stream, { type: "progress", text: "partial" });
    expect(result.current.streamingText).toBe("partial");

    await closeAndFlush(stream);

    expect(result.current.isLoading).toBe(false);
    expect(textOf(lastMessage(result))).toBe(CONNECTION_LOST);
    expect(result.current.streamingText).toBe("");
  });
});

describe("useChatRuntime — voice send", () => {
  it.each([
    ["", VOICE_SENTINEL],
    ["Hello", "Hello"],
  ])(
    "stores transcript %j as the user turn text %j and posts an audio body",
    async (transcript, expectedText) => {
      const { harness, result, stream } = await startStream(undefined, [
        transcript,
        "QUJD",
        "webm",
      ]);

      const user = result.current.messages.find((m) => m.role === "user");
      expect(user).toBeDefined();
      expect(textOf(user!)).toBe(expectedText);
      expect(result.current.isAudioRequest).toBe(true);

      expect(harness.streamBodies[0]).toEqual({
        message: transcript,
        message_type: "audio",
        audio_base64: "QUJD",
        audio_format: "webm",
      });

      await pushAndFlush(stream, completeEvent(["Spoken reply"]));
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isAudioRequest).toBe(false);
    }
  );
});

// ---------------------------------------------------------------------------
// Timeouts. The hook polls every 5s and aborts the fetch when no SSE event
// has arrived within the inactivity limit (120s by default, 300s once an
// audio/TTS status is seen), and unconditionally at the 300s hard maximum.
// On abort the browser errors the body stream with AbortError; the hook
// treats that as a silent reset (no chat message).
// ---------------------------------------------------------------------------

describe("useChatRuntime — timeouts", () => {
  it("aborts a text request after ~120s without events and resets state silently", async () => {
    const { result, stream } = await startStream();

    await pushAndFlush(stream, { type: "status", message: "Thinking" });
    expect(result.current.statusMessage).toBe("Thinking");

    // Just under the limit: still alive.
    await advance(115_000);
    expect(stream.signal?.aborted).toBe(false);
    expect(result.current.isLoading).toBe(true);

    // Past the limit (next 5s poll after 120s).
    await advance(10_000);
    expect(stream.signal?.aborted).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.statusMessage).toBeNull();
    // Silent reset: only the user message remains, no error message appended.
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("user");
  });

  it("an audio-generation status extends the inactivity window past the 120s default", async () => {
    const { result, stream } = await startStream();

    await pushAndFlush(stream, {
      type: "status",
      message: "Generating audio response",
    });
    expect(result.current.statusMessage).toBe("Generating audio response");

    // Well past the default limit, with no further events: the audio window
    // keeps it alive. (The audio window and the hard maximum are both 300s,
    // so the eventual abort is covered by the hard-maximum test below.)
    await advance(125_000);
    expect(stream.signal?.aborted).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it("a new event resets the inactivity clock", async () => {
    const { result, stream } = await startStream();

    await advance(100_000);
    await pushAndFlush(stream, { type: "keepalive" });
    await advance(100_000); // 200s since start, 100s since keepalive
    expect(stream.signal?.aborted).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it("aborts at the 300s hard maximum even while events keep the inactivity clock fresh", async () => {
    const { result, stream } = await startStream();

    await advance(100_000);
    await pushAndFlush(stream, { type: "keepalive" });
    await advance(100_000);
    await pushAndFlush(stream, { type: "keepalive" });
    await advance(99_000); // t ≈ 299s, last event 99s ago
    expect(stream.signal?.aborted).toBe(false);
    expect(result.current.isLoading).toBe(true);

    await advance(2_000); // t ≈ 301s
    expect(stream.signal?.aborted).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.messages).toHaveLength(1);
  });
});
