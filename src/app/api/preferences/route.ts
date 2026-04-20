import { auth } from "@/auth";
import { getUserPreferences, updateUserPreferences } from "@/lib/engine-client";
import { validateOrg } from "@/lib/validate-org";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PreferencesSchema = z.object({
  response_language: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const org = validateOrg(searchParams.get("org"));

  try {
    const preferences = await getUserPreferences(session.user.id, org);
    return NextResponse.json(preferences);
  } catch (error) {
    console.error("Preferences GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const org = validateOrg(searchParams.get("org"));

  try {
    const body = await req.json();
    const parsed = PreferencesSchema.parse(body);
    const preferences = await updateUserPreferences(
      session.user.id,
      parsed,
      org
    );
    return NextResponse.json(preferences);
  } catch (error) {
    console.error("Preferences PUT error:", error);

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
