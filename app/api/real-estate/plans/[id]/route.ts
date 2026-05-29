import { PlanHandlers } from "@/lib/api-handlers/real-estate-plan";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return PlanHandlers.get(req, params.id);
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return PlanHandlers.update(req, params.id);
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return PlanHandlers.remove(req, params.id);
}
