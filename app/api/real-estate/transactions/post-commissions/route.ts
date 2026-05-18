export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { TransactionHandlers as H } from "@/lib/api-handlers/real-estate-transactions";

export async function GET(req: NextRequest) {
  return H.listEligibleForPost(req);
}

export async function POST(req: NextRequest) {
  return H.bulkPostCommissions(req);
}
