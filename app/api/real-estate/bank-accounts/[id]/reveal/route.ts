export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { BankAccountHandlers as H } from "@/lib/api-handlers/real-estate-finance";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return H.reveal(req, (await ctx.params).id);
}
