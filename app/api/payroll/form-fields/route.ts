export const dynamic = 'force-dynamic';
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: "User is not a member of any organization" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const formId = searchParams.get("formId");

    if (!formId) {
      return NextResponse.json(
        { success: false, error: "Form ID is required" },
        { status: 400 }
      );
    }

    // The form must belong to the caller's org. Without this, anyone with
    // a guessable formId could enumerate another tenant's field schema.
    const form = await prisma.form.findFirst({
      where: { id: formId, module: { organizationId: authUser.organizationId } },
      include: {
        sections: {
          include: {
            fields: {
              orderBy: { order: "asc" },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!form) {
      return NextResponse.json(
        { success: false, error: "Form not found" },
        { status: 404 }
      );
    }

    const fields = form.sections.flatMap((section) =>
      section.fields.map((field) => ({
        id: field.id,
        label: field.label,
        type: field.type,
      }))
    );

    return NextResponse.json({
      success: true,
      fields,
    });
  } catch (error) {
    console.error("[payroll] form-fields error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch form fields" },
      { status: 500 }
    );
  }
}
