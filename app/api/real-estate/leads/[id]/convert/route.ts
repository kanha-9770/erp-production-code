export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { LeadHandlers as H } from "@/lib/api-handlers/real-estate-leads";

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  return H.convert(req, ctx.params.id);
}
