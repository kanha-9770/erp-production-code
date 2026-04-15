import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  isUserAdmin,
  apiSuccess,
  apiError,
  unauthorized,
  forbidden,
} from "@/lib/api-helpers";
import { preflight } from "@/lib/ai/preflight";

export const dynamic = "force-dynamic";

function serialise(row: {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  defaultModel: string;
  availableModels: unknown;
  isActive: boolean;
  isDefault: boolean;
  priority: number;
  temperature: number | null;
  maxTokens: number | null;
  createdAt: Date;
  updatedAt: Date;
  apiKeys?: Array<{
    id: string;
    label: string;
    keyPreview: string;
    isActive: boolean;
    lastUsedAt: Date | null;
    failureCount: number;
    cooldownUntil: Date | null;
    createdAt: Date;
  }>;
}) {
  return {
    ...row,
    availableModels: Array.isArray(row.availableModels)
      ? (row.availableModels as string[])
      : [],
    apiKeys: row.apiKeys ?? [],
  };
}

export async function GET(request: NextRequest) {
  try {
    const pf = await preflight();
    if (pf) return apiError(pf.message, pf.status);

    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorized();
    if (!user.organizationId) return apiError("No organization", 400);
    if (!(await isUserAdmin(user.id, user.organizationId))) return forbidden();

    const rows = await prisma.aIProvider.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ isDefault: "desc" }, { priority: "desc" }, { createdAt: "asc" }],
      include: {
        apiKeys: {
          orderBy: { createdAt: "asc" },
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
        },
      },
    });

    return apiSuccess(rows.map(serialise));
  } catch (err) {
    console.error("[GET /api/admin/ai/providers] unexpected error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const pf = await preflight();
    if (pf) return apiError(pf.message, pf.status);

    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorized();
    if (!user.organizationId) return apiError("No organization", 400);
    if (!(await isUserAdmin(user.id, user.organizationId))) return forbidden();

    let body: {
      name?: string;
      displayName?: string;
      baseUrl?: string;
      defaultModel?: string;
      availableModels?: string[];
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

    const { name, displayName, baseUrl, defaultModel } = body;
    if (!name || !displayName || !baseUrl || !defaultModel) {
      return apiError("name, displayName, baseUrl, defaultModel are required", 400);
    }

    const existing = await prisma.aIProvider.findUnique({
      where: { organizationId_name: { organizationId: user.organizationId, name } },
    });
    if (existing) {
      return apiError(`Provider "${name}" already exists for this organization`, 409);
    }

    const created = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.aIProvider.updateMany({
          where: { organizationId: user.organizationId! },
          data: { isDefault: false },
        });
      }
      return tx.aIProvider.create({
        data: {
          organizationId: user.organizationId!,
          name,
          displayName,
          baseUrl,
          defaultModel,
          availableModels: body.availableModels ?? [],
          isDefault: body.isDefault ?? false,
          priority: body.priority ?? 0,
          temperature: body.temperature ?? 0.7,
          maxTokens: body.maxTokens ?? null,
        },
        include: { apiKeys: true },
      });
    });

    return apiSuccess(serialise(created));
  } catch (err) {
    console.error("[POST /api/admin/ai/providers] unexpected error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}
