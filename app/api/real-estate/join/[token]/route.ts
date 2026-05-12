import { InviteHandlers } from "@/lib/api-handlers/real-estate-my-team";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  return InviteHandlers.lookup(req, params.token);
}
