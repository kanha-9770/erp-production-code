import { ReraHandlers } from "@/lib/api-handlers/real-estate-settings";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, props: { params: Promise<{ agentId: string }> }) {
  const params = await props.params;
  return ReraHandlers.verify(req, params.agentId);
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ agentId: string }> }) {
  const params = await props.params;
  return ReraHandlers.reject(req, params.agentId);
}
