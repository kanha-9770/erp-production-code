export const dynamic = 'force-dynamic';
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const formId = searchParams.get("formId");

    if (!formId) {
      return NextResponse.json(
        { success: false, error: "Form ID is required" },
        { status: 400 }
      );
    }

    // Fetch form sections and fields
    const form = await prisma.form.findUnique({
      where: { id: formId },
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

    // Flatten all fields from all sections
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
    console.error("[v0] Error fetching form fields:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch form fields" },
      { status: 500 }
    );
  }
}
