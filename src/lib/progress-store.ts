import type { ChatResponse, ProgressCallback } from "@/types/engine";

// SSE event types
export type SSEEvent =
  | { type: "progress"; text: string; messageKey: string }
  | { type: "complete"; response: ChatResponse }
  | { type: "error"; error: string };

interface PendingRequest {
  controller: ReadableStreamDefaultController<Uint8Array>;
  userId: string;
  createdAt: number;
}

// In-memory store for pending requests
const pendingRequests = new Map<string, PendingRequest>();

// Cleanup stale requests after 5 minutes
const STALE_TIMEOUT = 5 * 60 * 1000;

function encodeSSE(event: SSEEvent): Uint8Array {
  const data = JSON.stringify(event);
  return new TextEncoder().encode(`data: ${data}

`);
}

export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function registerRequest(
  requestId: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  userId: string
): void {
  pendingRequests.set(requestId, {
    controller,
    userId,
    createdAt: Date.now(),
  });
}

export function pushProgress(
  requestId: string,
  callback: ProgressCallback
): boolean {
  const request = pendingRequests.get(requestId);
  if (!request) {
    return false;
  }

  try {
    const event: SSEEvent = {
      type: "progress",
      text: callback.text,
      messageKey: callback.message_key,
    };
    request.controller.enqueue(encodeSSE(event));
    return true;
  } catch {
    // Controller might be closed
    pendingRequests.delete(requestId);
    return false;
  }
}

export function completeRequest(
  requestId: string,
  response: ChatResponse
): boolean {
  const request = pendingRequests.get(requestId);
  if (!request) {
    return false;
  }

  try {
    const event: SSEEvent = { type: "complete", response };
    request.controller.enqueue(encodeSSE(event));
    request.controller.close();
  } catch {
    // Ignore close errors
  } finally {
    pendingRequests.delete(requestId);
  }

  return true;
}

export function errorRequest(requestId: string, error: string): void {
  const request = pendingRequests.get(requestId);
  if (!request) {
    return;
  }

  try {
    const event: SSEEvent = { type: "error", error };
    request.controller.enqueue(encodeSSE(event));
    request.controller.close();
  } catch {
    // Ignore close errors
  } finally {
    pendingRequests.delete(requestId);
  }
}

export function cleanupRequest(requestId: string): void {
  const request = pendingRequests.get(requestId);
  if (request) {
    try {
      request.controller.close();
    } catch {
      // Ignore
    }
    pendingRequests.delete(requestId);
  }
}

export function getRequestUserId(requestId: string): string | null {
  return pendingRequests.get(requestId)?.userId ?? null;
}

// Cleanup stale requests periodically
export function cleanupStaleRequests(): void {
  const now = Date.now();
  for (const [requestId, request] of pendingRequests) {
    if (now - request.createdAt > STALE_TIMEOUT) {
      cleanupRequest(requestId);
    }
  }
}
