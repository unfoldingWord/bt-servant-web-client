import { auth } from "@/auth";
import { sendChatMessage } from "@/lib/engine-client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Allow up to 2 minutes for AI processing
export const maxDuration = 120;
const ChatRequestSchema = z.object({
  message: z.string(),
  message_type: z.enum(["text", "audio"]).default("text"),
  audio_base64: z.string().optional(),
  audio_format: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request
    const body = await req.json();
    const parsed = ChatRequestSchema.parse(body);

    // Call engine API
    const response = await sendChatMessage(
      session.user.id,
      parsed.message,
      parsed.message_type,
      parsed.audio_base64,
      parsed.audio_format
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("Chat API error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
