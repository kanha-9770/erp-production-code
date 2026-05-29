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

const KEY_SELECT = {
  id: true,
  label: true,
  keyPreview: true,
  isActive: true,
  lastUsedAt: true,
  failureCount: true,
  cooldownUntil: true,
  createdAt: true,
} as const;

async function loadProvider(id: string, organizationId: string) {
  return prisma.aIProvider.findFirst({
    where: { id, organizationId },
    include: {
      apiKeys: {
        orderBy: { createdAt: "asc" },
        select: KEY_SELECT,
      },
    },
  });
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const pf = await preflight();
    if (pf) return apiError(pf.message, pf.status);

    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorized();
    if (!user.organizationId) return apiError("No organization", 400);
    if (!(await isUserAdmin(user.id, user.organizationId))) return forbidden();

    const row = await loadProvider(params.id, user.organizationId);
    if (!row) return notFound("Provider not found");
    return apiSuccess(row);
  } catch (err) {
    console.error("[GET /api/admin/ai/providers/:id] error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const pf = await preflight();
    if (pf) return apiError(pf.message, pf.status);

    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorized();
    if (!user.organizationId) return apiError("No organization", 400);
    if (!(await isUserAdmin(user.id, user.organizationId))) return forbidden();

    const existing = await loadProvider(params.id, user.organizationId);
    if (!existing) return notFound("Provider not found");

    let body: {
      displayName?: string;
      baseUrl?: string;
      defaultModel?: string;
      availableModels?: string[];
      isActive?: boolean;
      isDefault?: boolean;
      priority?: number;
      temperature?: number | null;
      maxTokens?: number | null;
    };
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await tx.aIProvider.updateMany({
          where: {
            organizationId: user.organizationId!,
            id: { not: params.id },
          },
          data: { isDefault: false },
        });
      }
      return tx.aIProvider.update({
        where: { id: params.id },
        data: {
          displayName: body.displayName ?? undefined,
          baseUrl: body.baseUrl ?? undefined,
          defaultModel: body.defaultModel ?? undefined,
          availableModels: body.availableModels ?? undefined,
          isActive: body.isActive ?? undefined,
          isDefault: body.isDefault ?? undefined,
          priority: body.priority ?? undefined,
          temperature: body.temperature ?? undefined,
          maxTokens: body.maxTokens ?? undefined,
        },
        include: {
          apiKeys: { orderBy: { createdAt: "asc" }, select: KEY_SELECT },
        },
      });
    });

    invalidateProvider(params.id);
    return apiSuccess(updated);
  } catch (err) {
    console.error("[PATCH /api/admin/ai/providers/:id] error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const pf = await preflight();
    if (pf) return apiError(pf.message, pf.status);

    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorized();
    if (!user.organizationId) return apiError("No organization", 400);
    if (!(await isUserAdmin(user.id, user.organizationId))) return forbidden();

    const existing = await loadProvider(params.id, user.organizationId);
    if (!existing) return notFound("Provider not found");

    await moveToTrash("AIProvider", params.id, {
      userId: user.id,
      userName: user.email,
      organizationId: user.organizationId,
    });
    invalidateProvider(params.id);
    return apiSuccess({ id: params.id, deleted: true });
  } catch (err) {
    console.error("[DELETE /api/admin/ai/providers/:id] error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}
