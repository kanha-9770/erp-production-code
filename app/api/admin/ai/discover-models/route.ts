import { NextRequest } from "next/server";
import OpenAI from "openai";
import {
  getAuthenticatedUser,
  isUserAdmin,
  apiSuccess,
  apiError,
  unauthorized,
  forbidden,
} from "@/lib/api-helpers";
import {
  isLocalBaseUrl,
  normalizeLocalBaseUrl,
  describeUpstreamError,
} from "@/lib/ai/local-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/ai/discover-models
 * Pre-create discovery: caller supplies { baseUrl, apiKey? } and we probe
 * the OpenAI-compatible /v1/models endpoint. Used by the Add-Provider dialog
 * so users can pick models before the provider row exists in the DB.
 *
 * For local endpoints (Ollama / vLLM / llama.cpp) apiKey is optional — most
 * accept any string or none.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorized();
    if (!user.organizationId) return apiError("No organization", 400);
    if (!(await isUserAdmin(user.id, user.organizationId))) return forbidden();

    let body: { baseUrl?: string; apiKey?: string };
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    const baseUrl = body.baseUrl?.trim();
    if (!baseUrl) return apiError("baseUrl is required", 400);

    // Rewrite localhost → 127.0.0.1 for local endpoints to dodge Node 18+
    // dual-stack IPv6 resolution issues (::1 vs 127.0.0.1).
    const probeUrl = isLocalBaseUrl(baseUrl)
      ? normalizeLocalBaseUrl(baseUrl)
      : baseUrl;

    try {
      const client = new OpenAI({
        apiKey: body.apiKey?.trim() || "not-needed",
        baseURL: probeUrl,
      });
      const page = await client.models.list();
      const models = page.data
        .map((m) => m.id)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      return apiSuccess({ models, count: models.length });
    } catch (err) {
      console.warn(
        `[discover-models/POST] probe ${baseUrl} failed:`,
        (err as Error).message
      );
      return apiError(describeUpstreamError(err, baseUrl), 502);
    }
  } catch (err) {
    console.error("[POST /api/admin/ai/discover-models] error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}
