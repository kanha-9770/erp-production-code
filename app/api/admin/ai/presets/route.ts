import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  apiSuccess,
  apiError,
  unauthorized,
} from "@/lib/api-helpers";
import { PROVIDER_PRESETS } from "@/lib/ai/provider-presets";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorized();
    return apiSuccess(PROVIDER_PRESETS);
  } catch (err) {
    console.error("[GET /api/admin/ai/presets] error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}
