export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from "next/server";
import { FormBuilderHandlers as H } from "@/lib/api-handlers/form-builder";

export async function PUT(request: NextRequest, { params }: { params: { fieldId: string } }) {
  return H.updateField(request, params.fieldId);
}

export async function DELETE(request: NextRequest, { params }: { params: { fieldId: string } }) {
  return H.deleteField(request, params.fieldId);
}

export async function GET(_request: NextRequest, { params: _params }: { params: { fieldId: string } }) {
  return NextResponse.json({ success: true, data: null });
}
