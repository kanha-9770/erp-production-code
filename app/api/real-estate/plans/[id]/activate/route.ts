import { PlanHandlers } from "@/lib/api-handlers/real-estate-plan";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return PlanHandlers.activate(req, params.id);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return PlanHandlers.deactivate(req, params.id);
}
