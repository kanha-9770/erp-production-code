export const dynamic = 'force-dynamic';

import { type NextRequest } from "next/server";
import { UserManagementHandlers as H } from "@/lib/api-handlers/user-management";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return H.getEmployee(req, (await ctx.params).id);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return H.updateEmployee(req, (await ctx.params).id);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return H.deleteEmployee(req, (await ctx.params).id);
}
