import { ReraHandlers } from "@/lib/api-handlers/real-estate-settings";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest, props: { params: Promise<{ agentId: string }> }) {
  const params = await props.params;
  return ReraHandlers.get(req, params.agentId);
}

export async function PUT(req: NextRequest, props: { params: Promise<{ agentId: string }> }) {
  const params = await props.params;
  return ReraHandlers.upsert(req, params.agentId);
}
