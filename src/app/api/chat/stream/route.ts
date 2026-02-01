import { auth } from "@/auth";
import { NextRequest } from "next/server";
import { z } from "zod";

// Allow up to 2 minutes for AI processing
export const maxDuration = 120;

const ENGINE_BASE_URL = process.env.ENGINE_BASE_URL!;
const ENGINE_API_KEY = process.env.ENGINE_API_KEY!;
const CLIENT_ID = process.env.CLIENT_ID || "web";

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

  // Proxy to backend streaming endpoint
  const response = await fetch(`${ENGINE_BASE_URL}/api/v1/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENGINE_API_KEY}`,
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      user_id: session.user.id,
      message: parsed.message,
      message_type: parsed.message_type,
      ...(parsed.audio_base64 && { audio_base64: parsed.audio_base64 }),
      ...(parsed.audio_format && { audio_format: parsed.audio_format }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(
      JSON.stringify({ error: `Backend error: ${response.status} - ${errorText}` }),
      {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Stream the response directly back to the client
  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
