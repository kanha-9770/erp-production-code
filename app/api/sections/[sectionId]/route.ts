export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from "next/server";
import { FormBuilderHandlers as H } from "@/lib/api-handlers/form-builder";

export async function PUT(request: NextRequest, { params }: { params: { sectionId: string } }) {
  return H.updateSection(request, params.sectionId);
}

export async function DELETE(request: NextRequest, { params }: { params: { sectionId: string } }) {
  return H.deleteSection(request, params.sectionId);
}

export async function GET(_request: NextRequest, { params: _params }: { params: { sectionId: string } }) {
  return NextResponse.json({ success: true, data: null });
}
