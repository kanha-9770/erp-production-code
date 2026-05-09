export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { WithdrawalHandlers as H } from "@/lib/api-handlers/real-estate-finance";

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  return H.cancel(req, ctx.params.id);
}
