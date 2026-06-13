import { auth } from "@/auth";
import { getChatHistory } from "@/lib/engine-client";
import { resolveOrgForEmail } from "@/lib/org-resolver";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const email = session?.user?.email;
    if (!session?.user?.id || !email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const org = await resolveOrgForEmail(email);

    const history = await getChatHistory(session.user.id, limit, offset, org);

    return NextResponse.json(history);
  } catch (error) {
    console.error("Chat history API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
