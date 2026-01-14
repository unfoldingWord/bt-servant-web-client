import { auth } from "@/auth";
import { getChatHistory } from "@/lib/engine-client";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    console.log("[History API] Fetching history for user:", session.user.id);
    const history = await getChatHistory(session.user.id, limit, offset);
    console.log("[History API] Got", history.entries.length, "entries");

    return NextResponse.json(history);
  } catch (error) {
    console.error("Chat history API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
