export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { WalletHandlers as H } from "@/lib/api-handlers/real-estate-finance";

export async function GET(req: NextRequest) {
  return H.getMySlab(req);
}
