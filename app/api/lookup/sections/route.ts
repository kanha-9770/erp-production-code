// app/api/lookup/sections/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawFormId = searchParams.get("formId");

    if (!rawFormId) {
      return NextResponse.json(
        { success: false, error: "formId is required" },
        { status: 400 }
      );
    }

    // Clean prefix if frontend sends prefixed ID (form_xxx → xxx)
    const formId = rawFormId.replace(/^form_/, "");

    // Fetch sections using your Prisma schema (FormSection model with title field)
    const sections = await prisma.formSection.findMany({
      where: {
        formId: formId,
      },
      select: {
        id: true,
        title: true,         // Using title from your schema
        description: true,   // optional
        order: true,         // for sorting
      },
      orderBy: {
        order: "asc",
      },
    });

    // Map title → name to match frontend FormSection type { id, name }
    const responseData = sections.map(s => ({
      id: s.id,
      name: s.title,        // This makes it work with your frontend rendering
    }));

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("[/api/lookup/sections] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch sections" },
      { status: 500 }
    );
  }
}