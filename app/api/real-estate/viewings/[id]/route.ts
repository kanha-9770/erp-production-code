export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { ViewingHandlers as H } from "@/lib/api-handlers/real-estate-leads";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return H.update(req, (await ctx.params).id);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return H.remove(req, (await ctx.params).id);
}
