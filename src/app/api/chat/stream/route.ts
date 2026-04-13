import { auth } from "@/auth";
import { NextRequest } from "next/server";
import { z } from "zod";

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
  } catch (error) {
    console.error("[chat/stream] parse error", error);
    return new Response(
      JSON.stringify({
        error: "Invalid request",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Proxy SSE stream from upstream
  try {
    const upstreamResponse = await fetch(
      `${ENGINE_BASE_URL}/api/v1/chat/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENGINE_API_KEY}`,
          Accept: "text/event-stream",
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
      }
    );

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      const errorText = await upstreamResponse.text().catch(() => "no body");
      console.error("[chat/stream] upstream error", {
        status: upstreamResponse.status,
        body: errorText,
      });
      return new Response(
        JSON.stringify({
          error: `Upstream error: ${upstreamResponse.status}`,
        }),
        {
          status: upstreamResponse.status || 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(upstreamResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to connect to upstream" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
