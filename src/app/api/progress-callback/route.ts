import { NextRequest, NextResponse } from "next/server";
import { pushProgress } from "@/lib/progress-store";
import type { ProgressCallback } from "@/types/engine";

const ENGINE_API_KEY = process.env.ENGINE_API_KEY;

export async function POST(req: NextRequest) {
  // Validate X-Engine-Token header
  const token = req.headers.get("X-Engine-Token");
  if (!token || token !== ENGINE_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Extract requestId from query param
  const requestId = req.nextUrl.searchParams.get("requestId");
  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  try {
    const body: ProgressCallback = await req.json();

    // Push progress to SSE stream
    pushProgress(requestId, body);

    // Always return 200 - fire-and-forget pattern
    return NextResponse.json({ ok: true });
  } catch {
    // Still return 200 to not block engine
    return NextResponse.json({ ok: true });
  }
}
