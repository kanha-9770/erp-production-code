export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { LeadHandlers as H } from "@/lib/api-handlers/real-estate-leads";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return H.listActivities(req, (await ctx.params).id);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return H.addActivity(req, (await ctx.params).id);
}
