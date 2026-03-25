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

  // Validate the URL is well-formed and points to our engine
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(audioUrl);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid audio URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // SSRF prevention: origin must match our engine
  if (parsedUrl.origin !== new URL(ENGINE_BASE_URL).origin) {
    return new Response(JSON.stringify({ error: "Invalid audio URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Path must be an audio endpoint
  if (!parsedUrl.pathname.startsWith("/api/v1/audio/")) {
    return new Response(JSON.stringify({ error: "Invalid audio path" }), {
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

    const filename = parsedUrl.pathname.split("/").pop() || "audio.mp3";

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "Content-Disposition": `inline; filename="${filename}"`,
    };

    // Forward Content-Length so the browser can determine audio duration
    const contentLength = audioResponse.headers.get("Content-Length");
    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }

    return new Response(audioResponse.body, {
      status: 200,
      headers,
    });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to fetch audio" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
