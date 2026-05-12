import { ReraHandlers } from "@/lib/api-handlers/real-estate-settings";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, { params }: { params: { agentId: string } }) {
  return ReraHandlers.verify(req, params.agentId);
}

export async function DELETE(req: NextRequest, { params }: { params: { agentId: string } }) {
  return ReraHandlers.reject(req, params.agentId);
}
