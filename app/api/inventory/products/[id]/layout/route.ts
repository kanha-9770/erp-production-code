export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { InventoryHandlers as H } from "@/lib/api-handlers/inventory-products";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return H.saveLayout(req, id);
}
