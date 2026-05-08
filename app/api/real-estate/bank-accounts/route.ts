export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { BankAccountHandlers as H } from "@/lib/api-handlers/real-estate-finance";

export async function GET(req: NextRequest) {
  return H.listMine(req);
}

export async function POST(req: NextRequest) {
  return H.create(req);
}
