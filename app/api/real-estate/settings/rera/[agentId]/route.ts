import { ReraHandlers } from "@/lib/api-handlers/real-estate-settings";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { agentId: string } }) {
  return ReraHandlers.get(req, params.agentId);
}

export async function PUT(req: NextRequest, { params }: { params: { agentId: string } }) {
  return ReraHandlers.upsert(req, params.agentId);
}
