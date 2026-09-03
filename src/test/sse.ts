import type { SSEEvent } from "@/types/engine";

const SSE_HEADERS = { "Content-Type": "text/event-stream" };

/** One `data:` frame, as the BFF proxy relays it. */
export function encodeSseEvent(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * A finished SSE response whose frames are all known up front. A string body
 * is enough: `Response` already exposes it to the reader as a byte stream.
 */
export function sseResponse(events: SSEEvent[]): Response {
  return new Response(events.map(encodeSseEvent).join(""), {
    status: 200,
    headers: SSE_HEADERS,
  });
}

export interface SseStream {
  response: Response;
  /** Enqueues one frame. Ignored once the stream is closed or aborted. */
  push: (event: SSEEvent) => void;
  /** Ends the stream without a terminal event. */
  close: () => void;
  /** The fetch signal the stream was opened with, for `aborted` assertions. */
  signal: AbortSignal | null;
}

/**
 * A controllable SSE body standing in for the BFF proxy. Aborting `signal`
 * errors the stream with an AbortError, matching what a real browser fetch
 * does when the caller aborts mid-stream.
 */
export function createSseStream(signal: AbortSignal | null = null): SseStream {
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
    response: new Response(body, { status: 200, headers: SSE_HEADERS }),
    push: (event) => {
      if (closed) return;
      controller.enqueue(encoder.encode(encodeSseEvent(event)));
    },
    close: () => {
      if (closed) return;
      closed = true;
      controller.close();
    },
    signal,
  };
}
