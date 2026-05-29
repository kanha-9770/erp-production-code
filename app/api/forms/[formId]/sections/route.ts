// app/api/forms/[formId]/sections/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

/**
 * GET /api/forms/:formId/sections
 *
 * Returns all sections of a form (id, title, order).
 */
export async function GET(request: NextRequest, props: { params: Promise<{ formId: string }> }) {
  const params = await props.params;
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { formId } = params;
    if (!formId) {
      return NextResponse.json({ error: "formId is required" }, { status: 400 });
    }

    const sections = await prisma.formSection.findMany({
      where: { formId },
      select: {
        id: true,
        title: true,
        order: true,
        description: true,
      },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: sections,
    });
  } catch (error) {
    console.error("[GET /api/forms/[formId]/sections] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sections", details: String(error) },
      { status: 500 },
    );
  }
}
