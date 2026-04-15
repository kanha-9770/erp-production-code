import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  apiSuccess,
  apiError,
  unauthorized,
} from "@/lib/api-helpers";
import { preflight } from "@/lib/ai/preflight";

export const dynamic = "force-dynamic";

/**
 * User-facing list of active providers for the chatbot UI.
 * Exposes id / displayName / defaultModel / availableModels only — never keys.
 * Any authenticated user in the org can read this; /api/admin/ai/* stays admin-only.
 */
export async function GET(request: NextRequest) {
  try {
    const pf = await preflight();
    if (pf) return apiError(pf.message, pf.status);

    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorized();
    if (!user.organizationId) return apiError("No organization", 400);

    const rows = await prisma.aIProvider.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        apiKeys: { some: { isActive: true } },
      },
      orderBy: [{ isDefault: "desc" }, { priority: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        displayName: true,
        defaultModel: true,
        availableModels: true,
        isDefault: true,
      },
    });

    return apiSuccess(
      rows.map((r) => ({
        ...r,
        availableModels: Array.isArray(r.availableModels)
          ? (r.availableModels as string[])
          : [],
      }))
    );
  } catch (err) {
    console.error("[GET /api/chat/providers] error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}
