export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { LeadHandlers as H } from "@/lib/api-handlers/real-estate-leads";

// POST /api/real-estate/leads/[id]/claim — agent picks up a company-pool
// lead. Refuses if the lead is AGENT-origin or already claimed by another
// agent. See LeadHandlers.claim for the full semantics.
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  return H.claim(req, ctx.params.id);
}
