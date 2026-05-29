import { InviteHandlers } from "@/lib/api-handlers/real-estate-my-team";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  return InviteHandlers.redeem(req, params.token);
}
