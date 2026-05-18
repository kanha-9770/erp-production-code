export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { TransactionHandlers as H } from "@/lib/api-handlers/real-estate-transactions";

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  return H.postCommissions(req, ctx.params.id);
}
