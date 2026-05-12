import { InviteHandlers } from "@/lib/api-handlers/real-estate-my-team";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  return InviteHandlers.create(req);
}
