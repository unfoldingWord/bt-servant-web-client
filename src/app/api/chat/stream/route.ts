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
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Enqueue message
  try {
    const enqueueResponse = await fetch(
      `${ENGINE_BASE_URL}/api/v1/chat/queue`,
      {
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
      }
    );

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
    const message_id = result.message_id;

    if (!message_id) {
      return new Response(
        JSON.stringify({ error: "Server returned no message_id" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ message_id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to enqueue message" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
