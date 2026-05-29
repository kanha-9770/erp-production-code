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
import { invalidateProvider } from "@/lib/ai/key-rotator";
import { preflight } from "@/lib/ai/preflight";
import { moveToTrash } from "@/lib/trash";

export const dynamic = "force-dynamic";

async function guard(
  request: NextRequest,
  providerId: string,
  keyId: string
) {
  const pf = await preflight();
  if (pf) return { error: apiError(pf.message, pf.status) };

  const user = await getAuthenticatedUser(request);
  if (!user) return { error: unauthorized() };
  if (!user.organizationId)
    return { error: apiError("No organization", 400) };
  if (!(await isUserAdmin(user.id, user.organizationId)))
    return { error: forbidden() };

  const key = await prisma.aIProviderKey.findFirst({
    where: {
      id: keyId,
      providerId,
      organizationId: user.organizationId,
    },
  });
  if (!key) return { error: notFound("API key not found") };
  return { user, key };
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string; keyId: string }> }
) {
  const params = await props.params;
  try {
    const g = await guard(request, params.id, params.keyId);
    if ("error" in g) return g.error;

    let body: { isActive?: boolean; label?: string };
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    const updated = await prisma.aIProviderKey.update({
      where: { id: params.keyId },
      data: {
        isActive: body.isActive ?? undefined,
        label: body.label ?? undefined,
        failureCount: body.isActive === true ? 0 : undefined,
        cooldownUntil: body.isActive === true ? null : undefined,
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

    invalidateProvider(params.id);
    return apiSuccess(updated);
  } catch (err) {
    console.error("[PATCH /api/admin/ai/providers/:id/keys/:keyId] error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string; keyId: string }> }
) {
  const params = await props.params;
  try {
    const g = await guard(request, params.id, params.keyId);
    if ("error" in g) return g.error;

    await moveToTrash("AIProviderKey", params.keyId, {
      userId: g.user.id,
      userName: g.user.email,
      organizationId: g.user.organizationId,
    });
    invalidateProvider(params.id);
    return apiSuccess({ id: params.keyId, deleted: true });
  } catch (err) {
    console.error("[DELETE /api/admin/ai/providers/:id/keys/:keyId] error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}
