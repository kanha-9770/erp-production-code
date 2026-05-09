export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { ComplianceHandlers as H } from "@/lib/api-handlers/real-estate-compliance";

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  return H.verify(req, ctx.params.id);
}
