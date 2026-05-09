export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { ComplianceHandlers as H } from "@/lib/api-handlers/real-estate-compliance";

export async function GET(req: NextRequest) {
  return H.listMine(req);
}

export async function POST(req: NextRequest) {
  return H.uploadMine(req);
}
