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

export async function GET(request: NextRequest) {
  try {
    const pf = await preflight();
    if (pf) return apiError(pf.message, pf.status);

    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorized();
    if (!user.organizationId) return apiError("No organization", 400);

    const rows = await prisma.chatConversation.findMany({
      where: { userId: user.id, organizationId: user.organizationId },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        providerId: true,
        model: true,
        isPinned: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
      take: 200,
    });

    return apiSuccess(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        providerId: r.providerId,
        model: r.model,
        isPinned: r.isPinned,
        messageCount: r._count.messages,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
    );
  } catch (err) {
    console.error("[GET /api/chat/conversations] error", err);
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

    let body: {
      title?: string;
      providerId?: string;
      model?: string;
      systemPrompt?: string;
      temperature?: number;
    } = {};
    try {
      body = await request.json();
    } catch {
      // empty body allowed
    }

    const row = await prisma.chatConversation.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        title: body.title?.trim() || "New chat",
        providerId: body.providerId ?? null,
        model: body.model ?? null,
        systemPrompt: body.systemPrompt ?? null,
        temperature: body.temperature ?? null,
      },
    });

    return apiSuccess(row);
  } catch (err) {
    console.error("[POST /api/chat/conversations] error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}
