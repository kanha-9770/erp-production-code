export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { AgentHandlers as H } from "@/lib/api-handlers/real-estate-agents";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  return H.slabHistory(req, ctx.params.id);
}
