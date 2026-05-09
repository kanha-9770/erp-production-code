export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { RealEstateInstallHandlers as H } from "@/lib/api-handlers/real-estate-install";

export async function GET(req: NextRequest) {
  return H.status(req);
}

export async function POST(req: NextRequest) {
  return H.install(req);
}
