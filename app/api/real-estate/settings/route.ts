import { SettingsHandlers } from "@/lib/api-handlers/real-estate-settings";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  return SettingsHandlers.get(req);
}

export async function PATCH(req: NextRequest) {
  return SettingsHandlers.update(req);
}
