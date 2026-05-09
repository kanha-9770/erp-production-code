export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { InventoryHandlers as H } from "@/lib/api-handlers/inventory-products";

interface Ctx {
  params: Promise<{ slug: string }>;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return H.getBySlug(req, slug);
}
