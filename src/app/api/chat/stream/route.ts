import { auth } from "@/auth";
import { NextRequest } from "next/server";
import { z } from "zod";

// Allow up to 2 minutes for AI processing
export const maxDuration = 120;

const ENGINE_BASE_URL = process.env.ENGINE_BASE_URL!;
const ENGINE_API_KEY = process.env.ENGINE_API_KEY!;
const CLIENT_ID = process.env.CLIENT_ID || "web";
const DEFAULT_ORG = process.env.DEFAULT_ORG || "unfoldingWord";

const ChatStreamRequestSchema = z.object({
  message: z.string(),
  message_type: z.enum(["text", "audio"]).default("text"),
  audio_base64: z.string().optional(),
  audio_format: z.string().optional(),
});

/**
 * Translate a queue SSE event into the client SSE format.
 * Returns the formatted SSE line to send to the browser, or null to suppress.
 */
function translateQueueEvent(
  eventType: string | null,
  data: string
): string | null {
  switch (eventType) {
    case "queued":
      return `data: ${JSON.stringify({ type: "status", message: "Message queued..." })}\n\n`;

    case "processing":
      return `data: ${JSON.stringify({ type: "status", message: "Processing..." })}\n\n`;

    case "done":
      // Suppress — the worker's "complete" event already signals end-of-response
      return null;

    case "error": {
      let errorMessage = "Unknown error";
      try {
        const parsed = JSON.parse(data);
        errorMessage = parsed.error || errorMessage;
      } catch {
        if (data) errorMessage = data;
      }
      return `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`;
    }

    default:
      // No event type = worker pass-through. Already in the format the browser expects.
      return `data: ${data}\n\n`;
  }
}

/**
 * Creates a TransformStream that translates queue SSE events into the
 * client-expected SSE format. The queue uses named `event:` fields for
 * lifecycle events (queued, processing, done, error) and passes through
 * worker events as plain `data:` lines.
 */
function createQueueTransformStream(): TransformStream<Uint8Array, Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: string | null = null;

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          const data = line.slice(5).trimStart();
          const output = translateQueueEvent(currentEvent, data);
          if (output !== null) {
            controller.enqueue(encoder.encode(output));
          }
        } else if (line.trim() === "") {
          // End of SSE event block — reset state
          currentEvent = null;
        }
      }
    },
    flush(controller) {
      if (buffer.trim() && buffer.startsWith("data:")) {
        const data = buffer.slice(5).trimStart();
        const output = translateQueueEvent(currentEvent, data);
        if (output !== null) {
          controller.enqueue(encoder.encode(output));
        }
      }
    },
  });
}

export async function POST(req: NextRequest) {
  // Verify authentication
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse request
  let parsed;
  try {
    const body = await req.json();
    parsed = ChatStreamRequestSchema.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Step 1: Enqueue message
  console.log("[stream] step1: enqueuing message", {
    ENGINE_BASE_URL,
    user_id: session.user.id,
  });
  let message_id: string;
  try {
    const enqueueResponse = await fetch(`${ENGINE_BASE_URL}/api/v1/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENGINE_API_KEY}`,
      },
      body: JSON.stringify({
        user_id: session.user.id,
        org: DEFAULT_ORG,
        message: parsed.message,
        message_type: parsed.message_type,
        client_id: CLIENT_ID,
        ...(parsed.audio_base64 && { audio_base64: parsed.audio_base64 }),
        ...(parsed.audio_format && { audio_format: parsed.audio_format }),
      }),
    });

    if (!enqueueResponse.ok) {
      const errorText = await enqueueResponse.text();
      return new Response(
        JSON.stringify({
          error: `Enqueue error: ${enqueueResponse.status} - ${errorText}`,
        }),
        {
          status: enqueueResponse.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const result = await enqueueResponse.json();
    message_id = result.message_id;
    console.log("[stream] step1: enqueue success", {
      message_id,
      status: enqueueResponse.status,
    });

    if (!message_id) {
      return new Response(
        JSON.stringify({ error: "Server returned no message_id" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to enqueue message" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  // Step 2: Connect to SSE stream
  const streamUrl = `${ENGINE_BASE_URL}/api/v1/stream?user_id=${encodeURIComponent(session.user.id)}&message_id=${encodeURIComponent(message_id)}&org=${encodeURIComponent(DEFAULT_ORG)}`;
  console.log("[stream] step2: connecting to stream", { streamUrl });
  let streamResponse: Response;
  try {
    streamResponse = await fetch(streamUrl, {
      headers: {
        Authorization: `Bearer ${ENGINE_API_KEY}`,
        Accept: "text/event-stream",
      },
    });
    console.log("[stream] step2: stream response received", {
      status: streamResponse.status,
      hasBody: !!streamResponse.body,
    });

    if (!streamResponse.ok || !streamResponse.body) {
      const errorText = await streamResponse
        .text()
        .catch(() => "No response body");
      return new Response(
        JSON.stringify({
          error: `Stream error: ${streamResponse.status} - ${errorText}`,
        }),
        {
          status: streamResponse.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (err) {
    console.error("[stream] step2: stream fetch error", { error: String(err) });
    return new Response(
      JSON.stringify({ error: "Failed to connect to stream" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  // Step 3: Transform queue events and stream to client
  console.log("[stream] step3: piping stream to client");
  const transformStream = createQueueTransformStream();

  return new Response(streamResponse.body.pipeThrough(transformStream), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
