import { PlanHandlers } from "@/lib/api-handlers/real-estate-plan";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return PlanHandlers.get(req, params.id);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return PlanHandlers.update(req, params.id);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return PlanHandlers.remove(req, params.id);
}
