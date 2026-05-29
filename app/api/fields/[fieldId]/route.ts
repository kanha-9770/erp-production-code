export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from "next/server";
import { FormBuilderHandlers as H } from "@/lib/api-handlers/form-builder";

export async function PUT(request: NextRequest, props: { params: Promise<{ fieldId: string }> }) {
  const params = await props.params;
  return H.updateField(request, params.fieldId);
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ fieldId: string }> }) {
  const params = await props.params;
  return H.deleteField(request, params.fieldId);
}

export async function GET(_request: NextRequest, _props: { params: Promise<{ fieldId: string }> }) {
  return NextResponse.json({ success: true, data: null });
}
