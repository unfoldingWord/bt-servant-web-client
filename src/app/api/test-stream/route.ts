const ENGINE_BASE_URL = process.env.ENGINE_BASE_URL!;
const ENGINE_API_KEY = process.env.ENGINE_API_KEY!;

export async function GET() {
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
