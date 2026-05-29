import { NextRequest } from "next/server";
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
import { encryptApiKey, makeKeyPreview } from "@/lib/ai/crypto";
import { invalidateProvider } from "@/lib/ai/key-rotator";
import { preflight } from "@/lib/ai/preflight";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const pf = await preflight({ requireSecret: true });
    if (pf) return apiError(pf.message, pf.status);

    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorized();
    if (!user.organizationId) return apiError("No organization", 400);
    if (!(await isUserAdmin(user.id, user.organizationId))) return forbidden();

    const provider = await prisma.aIProvider.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
    });
    if (!provider) return notFound("Provider not found");

    let body: { label?: string; apiKey?: string };
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    const { label, apiKey } = body;
    if (!label || !apiKey) {
      return apiError("label and apiKey are required", 400);
    }
    if (apiKey.length < 8) {
      return apiError("apiKey looks too short", 400);
    }

    let encryptedKey: string;
    try {
      encryptedKey = encryptApiKey(apiKey);
    } catch (err) {
      return apiError((err as Error).message, 500);
    }

    const row = await prisma.aIProviderKey.create({
      data: {
        providerId: provider.id,
        organizationId: user.organizationId,
        label,
        encryptedKey,
        keyPreview: makeKeyPreview(apiKey),
      },
      select: {
        id: true,
        label: true,
        keyPreview: true,
        isActive: true,
        lastUsedAt: true,
        failureCount: true,
        cooldownUntil: true,
        createdAt: true,
      },
    });

    invalidateProvider(provider.id);
    return apiSuccess(row);
  } catch (err) {
    console.error("[POST /api/admin/ai/providers/:id/keys] error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}
