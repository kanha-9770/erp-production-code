export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { PropertyHandlers as H } from "@/lib/api-handlers/real-estate-properties";

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  return H.addImage(req, ctx.params.id);
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  return H.removeImage(req, ctx.params.id);
}
