export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { AgentHandlers as H } from "@/lib/api-handlers/real-estate-agents";

export async function GET(req: NextRequest) {
  return H.tree(req);
}
