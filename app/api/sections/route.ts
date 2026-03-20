export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from "next/server";
import { FormBuilderHandlers as H } from "@/lib/api-handlers/form-builder";

export async function POST(request: NextRequest) {
  return H.createSection(request);
}

export async function GET() {
  return NextResponse.json({ success: true, data: [] });
}
