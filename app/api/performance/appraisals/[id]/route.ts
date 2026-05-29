export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { AppraisalHandlers as H } from "@/lib/api-handlers/performance-appraisal";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  return H.get(req, ctx.params.id);
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  return H.update(req, ctx.params.id);
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  return H.remove(req, ctx.params.id);
}
