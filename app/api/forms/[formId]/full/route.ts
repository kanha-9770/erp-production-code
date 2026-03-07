// app/api/forms/[formId]/full/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/lib/database-service";

export async function GET(
  request: NextRequest,
  { params }: { params: { formId: string } }   // ← changed from { id } to { formId }
) {
  try {
    const { formId } = params;   // ← now correctly destructured

    console.log("API route hit — formId received:", formId);  // ← helpful debug log

    if (!formId) {
      return NextResponse.json(
        { success: false, error: "Form ID is required" },
        { status: 400 }
      );
    }

    // Reuse existing getForm method (pass formId)
    const form = await DatabaseService.getForm(formId);

    if (!form) {
      return NextResponse.json(
        { success: false, error: "Form not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: form,
    });
  } catch (error: any) {
    console.error("[GET /api/forms/[formId]/full] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load full form" },
      { status: 500 }
    );
  }
} 