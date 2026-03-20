// app/api/organization-units/route.ts
export const dynamic = 'force-dynamic';

import { type NextRequest } from "next/server";
import { OrganizationHandlers as H } from "@/lib/api-handlers/organization";

export async function GET(request: NextRequest) {
  return H.getOrgUnits(request);
}
