export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { InventoryHandlers as H } from "@/lib/api-handlers/inventory-products";

export async function GET(req: NextRequest) {
  return H.list(req);
}

export async function POST(req: NextRequest) {
  return H.create(req);
}
