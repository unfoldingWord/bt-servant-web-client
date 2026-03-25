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

  // Extract the path from the provided URL (which may be an internal DO URL
  // like http://do-internal/api/v1/audio/...) and re-root it on ENGINE_BASE_URL.
  // This prevents SSRF — we never fetch the provided host, only our engine.
  let audioPath: string;
  try {
    const parsed = new URL(audioUrl);
    audioPath = parsed.pathname + parsed.search;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid audio URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Sanity check: path must start with /api/v1/audio/
  if (!audioPath.startsWith("/api/v1/audio/")) {
    return new Response(JSON.stringify({ error: "Invalid audio path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fetchUrl = `${ENGINE_BASE_URL}${audioPath}`;

  try {
    const audioResponse = await fetch(fetchUrl, {
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

    const filename = audioPath.split("/").pop() || "audio.mp3";

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
