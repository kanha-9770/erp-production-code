export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { InventoryHandlers as H } from "@/lib/api-handlers/inventory-products";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return H.get(req, id);
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return H.update(req, id);
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return H.remove(req, id);
}
