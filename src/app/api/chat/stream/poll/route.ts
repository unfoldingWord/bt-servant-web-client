import { auth } from "@/auth";
import { NextRequest } from "next/server";

const ENGINE_BASE_URL = process.env.ENGINE_BASE_URL!;
const ENGINE_API_KEY = process.env.ENGINE_API_KEY!;
const DEFAULT_ORG = process.env.DEFAULT_ORG || "unfoldingWord";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { searchParams } = new URL(req.url);
  const message_id = searchParams.get("message_id");
  const cursor = searchParams.get("cursor") ?? "0";

  if (!message_id) {
    return new Response(JSON.stringify({ error: "Missing message_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const pollUrl = `${ENGINE_BASE_URL}/api/v1/chat/queue/poll?user_id=${encodeURIComponent(session.user.id)}&message_id=${encodeURIComponent(message_id)}&org=${encodeURIComponent(DEFAULT_ORG)}&cursor=${encodeURIComponent(cursor)}`;

    const pollResponse = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${ENGINE_API_KEY}` },
    });

    if (!pollResponse.ok) {
      const errorText = await pollResponse.text();
      return new Response(
        JSON.stringify({
          error: `Poll error: ${pollResponse.status} - ${errorText}`,
        }),
        {
          status: pollResponse.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const data = await pollResponse.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to poll for events" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
