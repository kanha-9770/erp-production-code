export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { TransactionHandlers as H } from "@/lib/api-handlers/real-estate-transactions";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  return H.get(req, ctx.params.id);
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  return H.update(req, ctx.params.id);
}
