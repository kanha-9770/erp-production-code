export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { RankPromotionHandlers as H } from "@/lib/api-handlers/real-estate-compliance";

export async function POST(req: NextRequest) {
  return H.evaluate(req);
}
