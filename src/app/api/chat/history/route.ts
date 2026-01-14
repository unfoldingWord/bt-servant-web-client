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

    console.log(
      "[history] Fetching for user:",
      session.user.id,
      "email:",
      session.user.email
    );

    const history = await getChatHistory(session.user.id, limit, offset);

    console.log(
      "[history] Got",
      history.entries.length,
      "entries for user",
      session.user.id
    );

    return NextResponse.json(history);
  } catch (error) {
    console.error("Chat history API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
