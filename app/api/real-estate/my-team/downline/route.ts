import { MyTeamHandlers } from "@/lib/api-handlers/real-estate-my-team";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  return MyTeamHandlers.getDownline(req);
}
