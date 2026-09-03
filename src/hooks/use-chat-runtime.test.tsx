import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { SSEEvent } from "@/types/engine";
import { useChatRuntime } from "./use-chat-runtime";

// ---------------------------------------------------------------------------
// Fixtures: a controllable SSE stream standing in for the BFF proxy. Aborting
// the fetch signal errors the body stream with an AbortError, matching what a
// real browser fetch does when the caller aborts mid-stream.
// ---------------------------------------------------------------------------

interface SseStream {
  response: Response;
  push: (event: SSEEvent) => void;
  pushRaw: (text: string) => void;
  close: () => void;
  signal: AbortSignal | null;
}

function createSseStream(signal: AbortSignal | null): SseStream {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  signal?.addEventListener("abort", () => {
    if (closed) return;
    closed = true;
    controller.error(
      new DOMException("The operation was aborted.", "AbortError")
    );
  });

  return {
    response: new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    push: (event) => {
      if (closed) return;
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    },
    pushRaw: (text) => {
      if (closed) return;
      controller.enqueue(encoder.encode(text));
    },
    close: () => {
      if (closed) return;
      closed = true;
      controller.close();
    },
    signal,
  };
}

interface FetchHarness {
  fetchMock: ReturnType<typeof vi.fn>;
  streams: SseStream[];
  streamBodies: Array<Record<string, unknown>>;
  /** Waits until the hook has opened the SSE request and returns its stream. */
  openStream: () => Promise<SseStream>;
}

function installFetch(
  opts: { streamStatus?: number; historyEntries?: unknown[] } = {}
): FetchHarness {
  const streams: SseStream[] = [];
  const streamBodies: Array<Record<string, unknown>> = [];

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/chat/history") {
        return new Response(
          JSON.stringify({ entries: opts.historyEntries ?? [] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "/api/chat/stream") {
        streamBodies.push(JSON.parse(String(init?.body)));
        if (opts.streamStatus && opts.streamStatus >= 400) {
          return new Response("upstream exploded", {
            status: opts.streamStatus,
          });
        }
        const stream = createSseStream(init?.signal ?? null);
        streams.push(stream);
        return stream.response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }
  );

  vi.stubGlobal("fetch", fetchMock);

  return {
    fetchMock,
    streams,
    streamBodies,
    openStream: async () => {
      await waitFor(() => expect(streams.length).toBeGreaterThan(0));
      return streams[streams.length - 1];
    },
  };
}

const completeEvent = (responses: string[]): SSEEvent => ({
  type: "complete",
  response: {
    responses,
    response_language: "en",
    voice_audio_base64: null,
  },
});

function lastMessage(result: { current: ReturnType<typeof useChatRuntime> }) {
  const msgs = result.current.messages;
  return msgs[msgs.length - 1];
}

function textOf(
  message: ReturnType<typeof useChatRuntime>["messages"][number]
) {
  return message.content[0]?.text ?? "";
}

const FALLBACK = "Sorry, I encountered an error. Please try again.";

/**
 * Renders the hook and lets the mount-time history load settle, mirroring
 * real usage where history resolves long before the user sends anything.
 */
async function mountRuntime(harness: FetchHarness) {
  const rendered = renderHook(() => useChatRuntime());
  await waitFor(() =>
    expect(harness.fetchMock).toHaveBeenCalledWith(
      "/api/chat/history",
      expect.anything()
    )
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return rendered;
}

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  // The hook logs its own errors/warnings; silence those but keep the
  // captured calls so React warnings (e.g. missing act()) still fail tests.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  const reactWarnings = consoleError.mock.calls.filter((args) =>
    args.some(
      (a) =>
        typeof a === "string" &&
        (a.includes("not wrapped in act") || a.startsWith("Warning:"))
    )
  );
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  expect(reactWarnings).toEqual([]);
});

// ---------------------------------------------------------------------------

describe("useChatRuntime — SSE event handling", () => {
  it("shows 'Connecting...' once the stream opens, then the status event text", async () => {
    const harness = installFetch();
    const { result } = await mountRuntime(harness);

    act(() => {
      void result.current.sendMessage("hi");
    });
    const stream = await harness.openStream();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() =>
      expect(result.current.statusMessage).toBe("Connecting...")
    );

    act(() => stream.push({ type: "status", message: "Looking up Amos" }));
    await waitFor(() =>
      expect(result.current.statusMessage).toBe("Looking up Amos")
    );
  });

  it("accumulates progress chunks into streamingText in arrival order", async () => {
    const harness = installFetch();
    const { result } = await mountRuntime(harness);

    act(() => {
      void result.current.sendMessage("hi");
    });
    const stream = await harness.openStream();

    act(() => stream.push({ type: "progress", text: "Amos " }));
    act(() => stream.push({ type: "progress", text: "was a " }));
    act(() => stream.push({ type: "progress", text: "shepherd." }));

    await waitFor(() =>
      expect(result.current.streamingText).toBe("Amos was a shepherd.")
    );

    // The synthetic streaming message is appended to the visible list.
    const last = lastMessage(result);
    expect(last.id).toBe("streaming");
    expect(last.isStreaming).toBe(true);
    expect(textOf(last)).toBe("Amos was a shepherd.");
  });

  it("complete with no prior progress appends one assistant message joined with \\n\\n and clears status/loading", async () => {
    const harness = installFetch();
    const { result } = await mountRuntime(harness);

    act(() => {
      void result.current.sendMessage("hi");
    });
    const stream = await harness.openStream();
    act(() => stream.push({ type: "status", message: "Thinking" }));
    await waitFor(() => expect(result.current.statusMessage).toBe("Thinking"));

    act(() => stream.push(completeEvent(["First part.", "Second part."])));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const assistant = result.current.messages.filter(
      (m) => m.role === "assistant"
    );
    expect(assistant).toHaveLength(1);
    expect(textOf(assistant[0])).toBe("First part.\n\nSecond part.");
    expect(assistant[0].isStreaming).toBeUndefined();
    expect(result.current.statusMessage).toBeNull();
    expect(result.current.streamingText).toBe("");
  });

  it("complete after progress defers the swap until finalizeComplete, then leaves exactly one assistant message", async () => {
    const harness = installFetch();
    const { result } = await mountRuntime(harness);

    act(() => {
      void result.current.sendMessage("hi");
    });
    const stream = await harness.openStream();
    act(() => stream.push({ type: "progress", text: "First part." }));
    await waitFor(() =>
      expect(result.current.streamingText).toBe("First part.")
    );

    act(() => stream.push(completeEvent(["First part.", "Second part."])));

    // Deferred: streamingText becomes the full joined response and the hook
    // reports isCompleting so AnimatedText can catch up.
    await waitFor(() => expect(result.current.isCompleting).toBe(true));
    expect(result.current.streamingText).toBe("First part.\n\nSecond part.");
    expect(result.current.statusMessage).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(lastMessage(result).id).toBe("streaming");

    // Invariant (docs/streaming-animation.md #2): a straggling progress chunk
    // after the terminal event must not mutate streamingText.
    act(() => stream.push({ type: "progress", text: "STRAGGLER" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.streamingText).toBe("First part.\n\nSecond part.");

    act(() => result.current.finalizeComplete());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const assistant = result.current.messages.filter(
      (m) => m.role === "assistant"
    );
    expect(assistant).toHaveLength(1);
    expect(textOf(assistant[0])).toBe("First part.\n\nSecond part.");
    expect(assistant[0].id).not.toBe("streaming");
    expect(result.current.isCompleting).toBe(false);
    expect(result.current.streamingText).toBe("");
  });

  it("error event appends the canned fallback (never the raw worker text) and clears loading", async () => {
    const harness = installFetch();
    const { result } = await mountRuntime(harness);

    act(() => {
      void result.current.sendMessage("hi");
    });
    const stream = await harness.openStream();
    act(() => stream.push({ type: "progress", text: "partial" }));
    await waitFor(() => expect(result.current.streamingText).toBe("partial"));

    const rawWorkerError =
      '{"error":{"type":"overloaded_error","message":"Overloaded"}}';
    act(() => stream.push({ type: "error", error: rawWorkerError }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const last = lastMessage(result);
    expect(last.role).toBe("assistant");
    expect(textOf(last)).toBe(FALLBACK);
    expect(textOf(last)).not.toContain("overloaded_error");
    expect(result.current.statusMessage).toBeNull();
    expect(result.current.streamingText).toBe("");
    expect(result.current.isCompleting).toBe(false);
  });

  it("a non-2xx stream response also yields the canned fallback", async () => {
    const harness = installFetch({ streamStatus: 502 });
    const { result } = await mountRuntime(harness);

    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(result.current.isLoading).toBe(false);
    const last = lastMessage(result);
    expect(last.role).toBe("assistant");
    expect(textOf(last)).toBe(FALLBACK);
    expect(textOf(last)).not.toContain("upstream exploded");
  });

  it("a stream that closes without a terminal event yields the connection-lost message", async () => {
    const harness = installFetch();
    const { result } = await mountRuntime(harness);

    act(() => {
      void result.current.sendMessage("hi");
    });
    const stream = await harness.openStream();
    act(() => stream.push({ type: "progress", text: "partial" }));
    await waitFor(() => expect(result.current.streamingText).toBe("partial"));

    act(() => stream.close());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(textOf(lastMessage(result))).toBe(
      "Connection lost. Please try again."
    );
    expect(result.current.streamingText).toBe("");
  });
});

describe("useChatRuntime — voice send", () => {
  it("stores the literal [Voice message] sentinel when the transcript is empty and posts an audio body", async () => {
    const harness = installFetch();
    const { result } = await mountRuntime(harness);

    act(() => {
      void result.current.sendMessage("", "QUJD", "webm");
    });
    const stream = await harness.openStream();

    const user = result.current.messages.find((m) => m.role === "user");
    expect(user).toBeDefined();
    expect(textOf(user!)).toBe("[Voice message]");
    expect(result.current.isAudioRequest).toBe(true);

    expect(harness.streamBodies[0]).toEqual({
      message: "",
      message_type: "audio",
      audio_base64: "QUJD",
      audio_format: "webm",
    });

    act(() => stream.push(completeEvent(["Spoken reply"])));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAudioRequest).toBe(false);
  });

  it("stores the transcript text (not the sentinel) when one is provided", async () => {
    const harness = installFetch();
    const { result } = await mountRuntime(harness);

    act(() => {
      void result.current.sendMessage("Hello", "QUJD", "webm");
    });
    await harness.openStream();

    const user = result.current.messages.find((m) => m.role === "user");
    expect(textOf(user!)).toBe("Hello");
    expect(harness.streamBodies[0]?.message_type).toBe("audio");
  });
});

// ---------------------------------------------------------------------------
// Inactivity handling. The hook polls every 5s and aborts the fetch when no
// SSE event has arrived within the limit (120s by default, 300s once an
// audio/TTS status is seen). On abort the browser errors the body stream
// with AbortError; the hook treats that as a silent reset (no chat message).
// ---------------------------------------------------------------------------

describe("useChatRuntime — inactivity timeout (fake timers)", () => {
  async function startWithFakeTimers(harness: FetchHarness) {
    // History settles on real timers before the clock is frozen so its
    // promise chain does not depend on faked timers.
    const { result } = await mountRuntime(harness);

    vi.useFakeTimers();
    await act(async () => {
      void result.current.sendMessage("hi");
      await vi.advanceTimersByTimeAsync(0);
    });
    const stream = harness.streams[harness.streams.length - 1];
    expect(stream).toBeDefined();
    return { result, stream: stream! };
  }

  it("aborts a text request after ~120s without events and resets state silently", async () => {
    const harness = installFetch();
    const { result, stream } = await startWithFakeTimers(harness);

    await act(async () => {
      stream.push({ type: "status", message: "Thinking" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.statusMessage).toBe("Thinking");

    // Just under the limit: still alive.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(115_000);
    });
    expect(stream.signal?.aborted).toBe(false);
    expect(result.current.isLoading).toBe(true);

    // Past the limit (next 5s poll after 120s).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(stream.signal?.aborted).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.statusMessage).toBeNull();
    // Silent reset: only the user message remains, no error message appended.
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("user");
  });

  it("an audio-generation status extends the inactivity window to ~300s", async () => {
    const harness = installFetch();
    const { result, stream } = await startWithFakeTimers(harness);

    await act(async () => {
      stream.push({ type: "status", message: "Generating audio response" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.statusMessage).toBe("Generating audio response");

    // Well past the default 120s limit: the audio window keeps it alive.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(125_000);
    });
    expect(stream.signal?.aborted).toBe(false);
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(165_000); // t ≈ 290s
    });
    expect(stream.signal?.aborted).toBe(false);
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000); // t ≈ 305s
    });
    expect(stream.signal?.aborted).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it("a new event resets the inactivity clock", async () => {
    const harness = installFetch();
    const { result, stream } = await startWithFakeTimers(harness);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100_000);
    });
    await act(async () => {
      stream.push({ type: "keepalive" });
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100_000); // 200s since start, 100s since keepalive
    });
    expect(stream.signal?.aborted).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });
});
