// app/api/roles/[id]/route.ts
export const dynamic = 'force-dynamic';

import { type NextRequest } from "next/server";
import { OrganizationHandlers as H } from "@/lib/api-handlers/organization";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return H.deleteRole(request, params.id);
}
