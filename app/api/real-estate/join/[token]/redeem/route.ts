import { InviteHandlers } from "@/lib/api-handlers/real-estate-my-team";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  return InviteHandlers.redeem(req, params.token);
}
