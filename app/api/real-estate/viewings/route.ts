export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { ViewingHandlers as H } from "@/lib/api-handlers/real-estate-leads";

export async function GET(req: NextRequest) {
  return H.list(req);
}

export async function POST(req: NextRequest) {
  return H.create(req);
}
