import { NextRequest } from "next/server";

const ENGINE_BASE_URL = process.env.ENGINE_BASE_URL!;
const ENGINE_API_KEY = process.env.ENGINE_API_KEY!;

/**
 * POST /api/test-stream/enqueue — enqueue a test message and return the message_id
 * Body: { user_id, message, org? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { user_id, message, org = "unfoldingWord" } = body;

  if (!user_id || !message) {
    return Response.json(
      { error: "user_id and message required" },
      { status: 400 }
    );
  }

  console.log("[test-enqueue] sending to worker", {
    user_id,
    message,
    org,
  });

  const response = await fetch(`${ENGINE_BASE_URL}/api/v1/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENGINE_API_KEY}`,
    },
    body: JSON.stringify({
      user_id,
      org,
      message,
      message_type: "text",
      client_id: "web-test",
    }),
  });

  const result = await response.json();
  console.log("[test-enqueue] result", {
    status: response.status,
    result,
  });

  return Response.json(result, { status: response.status });
}
