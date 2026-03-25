import { auth } from "@/auth";
import { NextRequest } from "next/server";

const ENGINE_BASE_URL = process.env.ENGINE_BASE_URL!;
const ENGINE_API_KEY = process.env.ENGINE_API_KEY!;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { searchParams } = new URL(req.url);
  const audioUrl = searchParams.get("url");

  if (!audioUrl) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // SSRF prevention: only allow URLs pointing to our engine
  if (!audioUrl.startsWith(ENGINE_BASE_URL)) {
    return new Response(JSON.stringify({ error: "Invalid audio URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const audioResponse = await fetch(audioUrl, {
      headers: { Authorization: `Bearer ${ENGINE_API_KEY}` },
    });

    if (!audioResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Audio fetch error: ${audioResponse.status}` }),
        {
          status: audioResponse.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Stream the audio response back with upstream headers
    const contentType =
      audioResponse.headers.get("Content-Type") || "audio/mpeg";
    const cacheControl =
      audioResponse.headers.get("Cache-Control") || "public, max-age=86400";

    return new Response(audioResponse.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to fetch audio" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
