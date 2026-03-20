// app/api/users/[id]/route.ts
export const dynamic = 'force-dynamic';

import { type NextRequest } from "next/server";
import { UserManagementHandlers as H } from "@/lib/api-handlers/user-management";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  return H.getUser(request, params.id);
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  return H.updateUser(request, params.id);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  return H.deleteUser(request, params.id);
}
