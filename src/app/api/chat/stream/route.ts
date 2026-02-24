import { auth } from "@/auth";
import { NextRequest } from "next/server";
import { z } from "zod";

// Allow up to 2 minutes for AI processing
export const maxDuration = 120;

const ENGINE_BASE_URL = process.env.ENGINE_BASE_URL!;
const ENGINE_API_KEY = process.env.ENGINE_API_KEY!;
const CLIENT_ID = process.env.CLIENT_ID || "web";
const DEFAULT_ORG = process.env.DEFAULT_ORG || "unfoldingWord";

const POLL_INTERVAL_ACTIVE_MS = 300;
const POLL_INTERVAL_IDLE_MS = 1000;
const POLL_MAX_TIME_MS = 120_000;

const ChatStreamRequestSchema = z.object({
  message: z.string(),
  message_type: z.enum(["text", "audio"]).default("text"),
  audio_base64: z.string().optional(),
  audio_format: z.string().optional(),
});

interface PollResponse {
  message_id: string;
  events: { event: string; data: string }[];
  done: boolean;
  cursor: number;
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

  // Step 2: Poll for events and stream to browser
  const userId = session.user.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "status", message: "Message queued..." })}\n\n`
        )
      );

      let cursor = 0;
      let pollInterval = POLL_INTERVAL_ACTIVE_MS;
      const startTime = Date.now();

      try {
        while (Date.now() - startTime < POLL_MAX_TIME_MS) {
          const pollUrl = `${ENGINE_BASE_URL}/api/v1/poll?user_id=${encodeURIComponent(userId)}&message_id=${encodeURIComponent(message_id)}&org=${encodeURIComponent(DEFAULT_ORG)}&cursor=${cursor}`;

          const pollResponse = await fetch(pollUrl, {
            headers: { Authorization: `Bearer ${ENGINE_API_KEY}` },
          });

          if (!pollResponse.ok) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", error: `Poll error: ${pollResponse.status}` })}\n\n`
              )
            );
            controller.close();
            return;
          }

          const pollData: PollResponse = await pollResponse.json();

          for (const event of pollData.events) {
            if (event.event === "done") continue;
            controller.enqueue(encoder.encode(`data: ${event.data}\n\n`));
          }

          cursor = pollData.cursor;

          if (pollData.done) {
            controller.close();
            return;
          }

          // Adaptive polling: fast when events flow, slow when idle
          pollInterval =
            pollData.events.length > 0
              ? POLL_INTERVAL_ACTIVE_MS
              : Math.min(pollInterval + 200, POLL_INTERVAL_IDLE_MS);

          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        // Timeout
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: "Request timed out" })}\n\n`
          )
        );
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[stream] polling error", {
          error: msg,
          cursor,
          elapsed: Date.now() - startTime,
        });
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: `Polling error: ${msg}` })}\n\n`
            )
          );
          controller.close();
        } catch {
          // Controller already closed (browser disconnected)
        }
      }
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
