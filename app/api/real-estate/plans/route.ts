import { PlanHandlers } from "@/lib/api-handlers/real-estate-plan";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  return PlanHandlers.list(req);
}

export async function POST(req: NextRequest) {
  return PlanHandlers.create(req);
}
