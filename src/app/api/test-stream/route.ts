import { NextRequest } from "next/server";

const ENGINE_BASE_URL = process.env.ENGINE_BASE_URL!;
const ENGINE_API_KEY = process.env.ENGINE_API_KEY!;

/**
 * Test 1: GET /api/test-stream — proxy a simple finite SSE from the worker (no DO)
 * Test 2: GET /api/test-stream?mode=do-replay&user_id=X&message_id=Y&org=Z
 *         — proxy the DO's /stream endpoint (tests replayStoredResponse path)
 * Test 3: GET /api/test-stream?mode=do-live&user_id=X&message_id=Y&org=Z
 *         — proxy the DO's /stream endpoint for a message that hasn't been processed yet
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") || "worker";

  if (mode === "do-replay" || mode === "do-live") {
    return testDOStream(req);
  }

  return testWorkerStream();
}

async function testWorkerStream() {
  const url = `${ENGINE_BASE_URL}/api/v1/test-stream`;
  console.log("[test-stream] fetching backend stream...", { url });

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${ENGINE_API_KEY}`,
        Accept: "text/event-stream",
      },
    });

    console.log("[test-stream] fetch resolved!", {
      status: response.status,
      hasBody: !!response.body,
      contentType: response.headers.get("content-type"),
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "no body");
      return new Response(JSON.stringify({ error: text }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[test-stream] fetch error", { error: String(err) });
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function testDOStream(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  const messageId = req.nextUrl.searchParams.get("message_id");
  const org = req.nextUrl.searchParams.get("org") || "unfoldingWord";

  if (!userId || !messageId) {
    return new Response(
      JSON.stringify({ error: "user_id and message_id required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const streamUrl = `${ENGINE_BASE_URL}/api/v1/chat/queue/stream?user_id=${encodeURIComponent(userId)}&message_id=${encodeURIComponent(messageId)}&org=${encodeURIComponent(org)}`;
  console.log("[test-stream] fetching DO stream...", { streamUrl });

  try {
    const response = await fetch(streamUrl, {
      headers: {
        Authorization: `Bearer ${ENGINE_API_KEY}`,
        Accept: "text/event-stream",
      },
    });

    console.log("[test-stream] DO stream fetch resolved!", {
      status: response.status,
      hasBody: !!response.body,
      contentType: response.headers.get("content-type"),
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "no body");
      return new Response(JSON.stringify({ error: text }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[test-stream] DO stream error", { error: String(err) });
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
