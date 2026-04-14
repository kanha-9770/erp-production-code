// app/api/forms/[formId]/section-fields/route.ts
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

/**
 * GET /api/forms/:formId/section-fields
 *
 * Returns all sections of a form with their fields nested, used by the
 * field-level permission matrix.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { formId: string } }
) {
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
        fields: {
          select: {
            id: true,
            label: true,
            type: true,
            order: true,
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: sections,
    });
  } catch (error) {
    console.error("[GET /api/forms/[formId]/section-fields] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch section fields", details: String(error) },
      { status: 500 },
    );
  }
}
