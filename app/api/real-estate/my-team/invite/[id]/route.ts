import { InviteHandlers } from "@/lib/api-handlers/real-estate-my-team";
import type { NextRequest } from "next/server";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return InviteHandlers.cancel(req, params.id);
}
