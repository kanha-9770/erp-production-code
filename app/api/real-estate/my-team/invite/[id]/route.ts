import { InviteHandlers } from "@/lib/api-handlers/real-estate-my-team";
import type { NextRequest } from "next/server";

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return InviteHandlers.cancel(req, params.id);
}
