import { PlanHandlers } from "@/lib/api-handlers/real-estate-plan";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return PlanHandlers.activate(req, params.id);
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return PlanHandlers.deactivate(req, params.id);
}
