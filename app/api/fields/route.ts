export const dynamic = 'force-dynamic';

import { type NextRequest } from "next/server";
import { FormBuilderHandlers as H } from "@/lib/api-handlers/form-builder";
import { DatabaseService } from "@/lib/database-service";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  return H.createField(request);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get("sectionId");
    const subformId = searchParams.get("subformId");

    if (sectionId) {
      const fields = await DatabaseService.getFields(sectionId);
      return NextResponse.json({ success: true, data: fields });
    }

    if (subformId) {
      const fields = await DatabaseService.getFields(subformId);
      return NextResponse.json({ success: true, data: fields });
    }

    const fields = await DatabaseService.getAllFields();
    return NextResponse.json({ success: true, data: fields });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
