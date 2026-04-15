import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  apiSuccess,
  apiError,
  unauthorized,
} from "@/lib/api-helpers";
import { preflight } from "@/lib/ai/preflight";
import { isLocalProvider } from "@/lib/ai/local-provider";

export const dynamic = "force-dynamic";

/**
 * User-facing list of active providers for the chatbot UI.
 * Exposes id / displayName / defaultModel / availableModels only — never keys.
 * Any authenticated user in the org can read this; /api/admin/ai/* stays admin-only.
 *
 * Cloud providers are only listed when they have at least one active key.
 * Local providers (Ollama, vLLM, llama.cpp, LM Studio, or any baseUrl pointing
 * at loopback / RFC1918 / host.docker.internal) are listed even with zero keys
 * — self-hosted servers ignore the Authorization header, so requiring a stored
 * key would just gate the user out of their own GPU box for no reason.
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
      },
      orderBy: [{ isDefault: "desc" }, { priority: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        displayName: true,
        baseUrl: true,
        defaultModel: true,
        availableModels: true,
        isDefault: true,
        apiKeys: {
          where: { isActive: true },
          select: { id: true },
          take: 1,
        },
      },
    });

    const listed = rows.filter(
      (r) => r.apiKeys.length > 0 || isLocalProvider(r)
    );

    return apiSuccess(
      listed.map((r) => ({
        id: r.id,
        name: r.name,
        displayName: r.displayName,
        defaultModel: r.defaultModel,
        availableModels: Array.isArray(r.availableModels)
          ? (r.availableModels as string[])
          : [],
        isDefault: r.isDefault,
        isLocal: isLocalProvider({ name: r.name, baseUrl: r.baseUrl }),
      }))
    );
  } catch (err) {
    console.error("[GET /api/chat/providers] error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}
