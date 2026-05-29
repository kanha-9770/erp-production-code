export const dynamic = "force-dynamic";

import { type NextRequest } from "next/server";
import { ExitChecklistHandlers as H } from "@/lib/api-handlers/offboarding";

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  return H.updateTask(req, ctx.params.id);
}
