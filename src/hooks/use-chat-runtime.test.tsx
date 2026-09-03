// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const trackMock = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: trackMock }));
vi.mock("@assistant-ui/react", () => ({
  useExternalStoreRuntime: () => ({}),
}));

const encoder = new TextEncoder();

/**
 * Fake `/api/chat/stream`: a stream that never sends a terminal event and
 * errors with AbortError when the request signal aborts (like real fetch).
 * With `keepaliveEveryMs` it emits keepalive events so the inactivity timer
 * never trips and only the hard max can.
 */
function installFetch(opts: { keepaliveEveryMs?: number } = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/chat/history")) {
      return Promise.resolve(
        new Response(JSON.stringify({ entries: [] }), { status: 200 })
      );
    }
    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let timer: ReturnType<typeof setInterval> | null = null;
        if (opts.keepaliveEveryMs) {
          timer = setInterval(() => {
            controller.enqueue(
              encoder.encode('data: {"type":"keepalive"}\n\n')
            );
          }, opts.keepaliveEveryMs);
        }
        signal?.addEventListener("abort", () => {
          if (timer) clearInterval(timer);
          controller.error(new DOMException("Aborted", "AbortError"));
        });
      },
    });
    return Promise.resolve(new Response(body, { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers();
  trackMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function renderRuntime() {
  const { useChatRuntime } = await import("./use-chat-runtime");
  const hook = renderHook(() => useChatRuntime());
  // let the history load settle
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return hook;
}

function failedEvents() {
  return trackMock.mock.calls.filter((c) => c[0] === "chat_response_failed");
}

describe("useChatRuntime timeout telemetry", () => {
  it("records chat_response_failed with reason inactivity_timeout", async () => {
    installFetch();
    const { result } = await renderRuntime();

    await act(async () => {
      void result.current.sendMessage("hello");
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isLoading).toBe(true);

    // 2 min inactivity limit, checked every 5 s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(125_000);
    });

    expect(failedEvents()).toHaveLength(1);
    expect(failedEvents()[0][1]).toMatchObject({
      reason: "inactivity_timeout",
    });
    expect(failedEvents()[0][1].duration_ms).toBeGreaterThanOrEqual(120_000);
    expect(result.current.isLoading).toBe(false);
    const last = result.current.messages.at(-1)!;
    expect(last.role).toBe("assistant");
    expect(last.content[0].text).toMatch(/took too long/);
  });

  it("records chat_response_failed with reason hard_max_timeout", async () => {
    installFetch({ keepaliveEveryMs: 30_000 });
    const { result } = await renderRuntime();

    await act(async () => {
      void result.current.sendMessage("hello");
      await vi.advanceTimersByTimeAsync(0);
    });

    // keepalives keep the inactivity timer happy; the 5 min ceiling fires
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299_000);
    });
    expect(failedEvents()).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(failedEvents()).toHaveLength(1);
    expect(failedEvents()[0][1]).toMatchObject({
      reason: "hard_max_timeout",
    });
    expect(failedEvents()[0][1].duration_ms).toBeGreaterThanOrEqual(300_000);
    expect(result.current.isLoading).toBe(false);
  });

  it("does not count an unmount abort as a failure", async () => {
    installFetch({ keepaliveEveryMs: 30_000 });
    const hook = await renderRuntime();

    await act(async () => {
      void hook.result.current.sendMessage("hello");
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      hook.unmount();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(failedEvents()).toHaveLength(0);
  });
});
