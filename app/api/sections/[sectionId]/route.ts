export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from "next/server";
import { FormBuilderHandlers as H } from "@/lib/api-handlers/form-builder";

export async function PUT(request: NextRequest, props: { params: Promise<{ sectionId: string }> }) {
  const params = await props.params;
  return H.updateSection(request, params.sectionId);
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ sectionId: string }> }) {
  const params = await props.params;
  return H.deleteSection(request, params.sectionId);
}

export async function GET(_request: NextRequest, _props: { params: Promise<{ sectionId: string }> }) {
  return NextResponse.json({ success: true, data: null });
}
