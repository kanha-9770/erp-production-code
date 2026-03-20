export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from "next/server";
import { OrganizationHandlers as H } from "@/lib/api-handlers/organization";

export async function GET() {
  return H.getEmployeePermissions(null as any);
}

export async function POST(request: NextRequest) {
  return H.updateEmployeePermissions(request);
}
