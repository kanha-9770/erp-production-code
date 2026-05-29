export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { ComplianceHandlers as H } from "@/lib/api-handlers/real-estate-compliance";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return H.remove(req, (await ctx.params).id);
}
