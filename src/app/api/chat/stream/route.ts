import { auth } from "@/auth";
import { sendChatMessage } from "@/lib/engine-client";
import {
  generateRequestId,
  registerRequest,
  completeRequest,
  errorRequest,
  cleanupRequest,
} from "@/lib/progress-store";
import { NextRequest } from "next/server";
import { z } from "zod";

const PUBLIC_URL = process.env.PUBLIC_URL;
const PROGRESS_THROTTLE_SECONDS = parseFloat(
  process.env.PROGRESS_THROTTLE_SECONDS || "3.0"
);

const ChatStreamRequestSchema = z.object({
  message: z.string(),
  message_type: z.enum(["text", "audio"]).default("text"),
  audio_base64: z.string().optional(),
  audio_format: z.string().optional(),
});

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

  const requestId = generateRequestId();

  // Build callback URL if PUBLIC_URL is configured
  const progressCallbackUrl = PUBLIC_URL
    ? `${PUBLIC_URL}/api/progress-callback?requestId=${requestId}`
    : undefined;

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Register this request for progress callbacks
      registerRequest(requestId, controller, session.user!.id!);

      // Start the engine request (don't await - let it run async)
      sendChatMessage(
        session.user!.id!,
        parsed.message,
        parsed.message_type,
        parsed.audio_base64,
        parsed.audio_format,
        progressCallbackUrl,
        PROGRESS_THROTTLE_SECONDS
      )
        .then((response) => {
          // Send complete event and close
          completeRequest(requestId, response);
        })
        .catch((error) => {
          console.error("Chat stream error:", error);
          errorRequest(
            requestId,
            error instanceof Error ? error.message : "Unknown error"
          );
        });
    },
    cancel() {
      // Client disconnected - cleanup
      cleanupRequest(requestId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
