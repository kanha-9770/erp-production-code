import { NextRequest } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  isUserAdmin,
  apiSuccess,
  apiError,
  unauthorized,
  forbidden,
  notFound,
} from "@/lib/api-helpers";
import { preflight } from "@/lib/ai/preflight";
import { pickKey } from "@/lib/ai/key-rotator";
import { getPreset } from "@/lib/ai/provider-presets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/ai/providers/:id/models
 * Discovers models from the provider's OpenAI-compatible /v1/models endpoint.
 * Uses an existing active key via the rotator. Falls back to preset suggestions
 * if discovery fails (e.g. endpoint not supported, network error).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const pf = await preflight();
    if (pf) return apiError(pf.message, pf.status);

    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorized();
    if (!user.organizationId) return apiError("No organization", 400);
    if (!(await isUserAdmin(user.id, user.organizationId))) return forbidden();

    const provider = await prisma.aIProvider.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
      include: { _count: { select: { apiKeys: { where: { isActive: true } } } } },
    });
    if (!provider) return notFound("Provider not found");

    const preset = getPreset(provider.name);
    const suggested = preset?.suggestedModels ?? [];

    if (provider._count.apiKeys === 0) {
      return apiSuccess({
        source: "preset",
        models: suggested,
        warning: "Add an active API key to discover live models from the provider",
      });
    }

    const key = await pickKey(provider.id);
    if (!key) {
      return apiSuccess({
        source: "preset",
        models: suggested,
        warning: "No usable API key available — showing preset suggestions",
      });
    }

    try {
      const client = new OpenAI({
        apiKey: key.plaintext,
        baseURL: provider.baseUrl,
      });
      const page = await client.models.list();
      const discovered = page.data
        .map((m) => m.id)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      // Union with preset so helpful models still show even if upstream is sparse
      const merged = Array.from(new Set([...discovered, ...suggested])).sort((a, b) =>
        a.localeCompare(b)
      );

      return apiSuccess({
        source: discovered.length ? "live" : "preset",
        models: merged,
        discoveredCount: discovered.length,
      });
    } catch (err) {
      console.warn(
        `[discover-models] ${provider.name} failed:`,
        (err as Error).message
      );
      return apiSuccess({
        source: "preset",
        models: suggested,
        warning: `Live discovery failed: ${(err as Error).message}. Showing preset suggestions.`,
      });
    }
  } catch (err) {
    console.error("[GET /api/admin/ai/providers/:id/models] error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}
