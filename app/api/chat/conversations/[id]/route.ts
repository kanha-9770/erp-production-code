import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  apiSuccess,
  apiError,
  unauthorized,
  notFound,
} from "@/lib/api-helpers";
import { preflight } from "@/lib/ai/preflight";
import { moveToTrash } from "@/lib/trash";

export const dynamic = "force-dynamic";

async function load(id: string, userId: string) {
  return prisma.chatConversation.findFirst({
    where: { id, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          providerName: true,
          model: true,
          createdAt: true,
        },
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

    const row = await load(params.id, user.id);
    if (!row) return notFound("Conversation not found");
    return apiSuccess(row);
  } catch (err) {
    console.error("[GET /api/chat/conversations/:id] error", err);
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

    const existing = await prisma.chatConversation.findFirst({
      where: { id: params.id, userId: user.id },
    });
    if (!existing) return notFound("Conversation not found");

    let body: {
      title?: string;
      isPinned?: boolean;
      providerId?: string | null;
      model?: string | null;
      systemPrompt?: string | null;
      temperature?: number | null;
    };
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    const updated = await prisma.chatConversation.update({
      where: { id: params.id },
      data: {
        title: body.title?.trim() || undefined,
        isPinned: body.isPinned ?? undefined,
        providerId: body.providerId ?? undefined,
        model: body.model ?? undefined,
        systemPrompt: body.systemPrompt ?? undefined,
        temperature: body.temperature ?? undefined,
      },
    });

    return apiSuccess(updated);
  } catch (err) {
    console.error("[PATCH /api/chat/conversations/:id] error", err);
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

    const existing = await prisma.chatConversation.findFirst({
      where: { id: params.id, userId: user.id },
    });
    if (!existing) return notFound("Conversation not found");

    await moveToTrash("ChatConversation", params.id, {
      userId: user.id,
      userName: user.email,
      organizationId: user.organizationId,
    });
    return apiSuccess({ id: params.id, deleted: true });
  } catch (err) {
    console.error("[DELETE /api/chat/conversations/:id] error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}
