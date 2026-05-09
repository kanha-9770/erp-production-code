export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { ReportHandlers as H } from "@/lib/api-handlers/real-estate-compliance";

export async function GET(req: NextRequest) {
  return H.leaderboard(req);
}
