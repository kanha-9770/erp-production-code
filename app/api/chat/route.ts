import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  apiError,
  unauthorized,
  apiSuccess,
} from "@/lib/api-helpers";
import { chat, chatStream } from "@/lib/ai/llm-client";
import { LLMClientError } from "@/lib/ai/types";
import type { ChatMessage } from "@/lib/ai/types";
import { preflight } from "@/lib/ai/preflight";
import {
  buildUserContext,
  renderContextForSystemPrompt,
} from "@/lib/ai/context-builder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/chat
 * Body: {
 *   messages: ChatMessage[],
 *   model?, temperature?, maxTokens?, stream?, providerId?,
 *   conversationId?   // when provided, persists user+assistant messages to that conversation
 * }
 * Response:
 *   - stream=true → SSE { delta | error | done }, with X-Conversation-Id header if persisted
 *   - stream=false → JSON { content, model, providerName, keyPreview, conversationId? }
 */
export async function POST(request: NextRequest) {
  try {
    const pf = await preflight();
    if (pf) return apiError(pf.message, pf.status);

    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorized();
    if (!user.organizationId) return apiError("No organization", 400);

    let body: {
      messages?: ChatMessage[];
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
      providerId?: string;
      conversationId?: string;
    };
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return apiError("messages array is required", 400);
    }

    // If conversationId is provided, verify ownership (blocking, for security)
    // but fire-and-forget the user-message + title writes so the LLM call
    // starts sooner. This shaves 15–35ms off every turn.
    let conversationId: string | null = null;
    if (body.conversationId) {
      const conv = await prisma.chatConversation.findFirst({
        where: { id: body.conversationId, userId: user.id },
      });
      if (!conv) return apiError("Conversation not found", 404);
      conversationId = conv.id;

      const lastUser = body.messages[body.messages.length - 1];
      if (lastUser?.role === "user") {
        const writes: Promise<unknown>[] = [
          prisma.chatMessage.create({
            data: {
              conversationId,
              role: "user",
              content: lastUser.content,
            },
          }),
        ];
        if (conv.title === "New chat") {
          const title =
            lastUser.content.split("\n")[0].slice(0, 60) || "New chat";
          writes.push(
            prisma.chatConversation.update({
              where: { id: conv.id },
              data: { title },
            })
          );
        }
        Promise.all(writes).catch((err) =>
          console.error("[api/chat] failed to persist user message", err)
        );
      }
    }

    // Build user context and inject it into the system prompt so the LLM
    // knows who it's talking to and what they can access. This unlocks the
    // tool-calling layer — tools use the same context for permission checks.
    // Context is cached for 60s per user, so follow-up messages skip the DB.
    const userCtx = await buildUserContext(user.id, user.organizationId);
    if (!userCtx) return apiError("Could not resolve user context", 500);

    const contextBlock = renderContextForSystemPrompt(userCtx);

    // Truncate message history to the last 20 non-system messages.
    // Long conversations otherwise re-send everything on every turn, which
    // slows TTFT proportionally. The system message is always preserved.
    const MAX_HISTORY = 20;
    const rawMessages = body.messages;
    const systemMessages = rawMessages.filter((m) => m.role === "system");
    const nonSystem = rawMessages.filter((m) => m.role !== "system");
    const trimmedNonSystem =
      nonSystem.length > MAX_HISTORY ? nonSystem.slice(-MAX_HISTORY) : nonSystem;
    const augmentedMessages: ChatMessage[] = [
      ...systemMessages,
      ...trimmedNonSystem,
    ];

    // Merge our context into the messages array:
    //   - If the caller already sent a system message, prepend our context to it
    //   - Otherwise, insert a new system message at position 0
    const firstSystemIdx = augmentedMessages.findIndex((m) => m.role === "system");
    if (firstSystemIdx === -1) {
      augmentedMessages.unshift({ role: "system", content: contextBlock });
    } else {
      augmentedMessages[firstSystemIdx] = {
        role: "system",
        content: `${contextBlock}\n\n${augmentedMessages[firstSystemIdx].content}`,
      };
    }

    const req = {
      messages: augmentedMessages,
      model: body.model,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      providerId: body.providerId,
    };

    if (body.stream) {
      const { stream, providerName, model } = await chatStream(
        user.organizationId,
        req,
        userCtx
      );

      // Tee the stream so we can capture the assembled assistant content
      // and persist it after the stream completes.
      let assembled = "";
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const reader = stream.getReader();

      const out = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) {
                controller.enqueue(value);
                // Parse frames to extract delta text
                const text = decoder.decode(value, { stream: true });
                for (const line of text.split("\n")) {
                  const trimmed = line.trim();
                  if (!trimmed.startsWith("data:")) continue;
                  const data = trimmed.slice(5).trim();
                  if (data === "[DONE]") continue;
                  try {
                    const parsed = JSON.parse(data);
                    if (typeof parsed.delta === "string") assembled += parsed.delta;
                  } catch {
                    /* ignore */
                  }
                }
              }
            }
            controller.close();
          } catch (err) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: (err as Error).message })}\n\n`
              )
            );
            controller.close();
          } finally {
            if (conversationId && assembled) {
              prisma.chatMessage
                .create({
                  data: {
                    conversationId,
                    role: "assistant",
                    content: assembled,
                    providerName,
                    model,
                  },
                })
                .then(() =>
                  prisma.chatConversation.update({
                    where: { id: conversationId! },
                    data: { updatedAt: new Date() },
                  })
                )
                .catch((e) =>
                  console.error("[api/chat] failed to persist assistant message", e)
                );
            }
          }
        },
      });

      const headers: Record<string, string> = {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Provider": providerName,
        "X-Model": model,
      };
      if (conversationId) headers["X-Conversation-Id"] = conversationId;

      return new Response(out, { headers });
    }

    // Non-streaming path
    const result = await chat(user.organizationId, req);

    if (conversationId && result.content) {
      await prisma.chatMessage.create({
        data: {
          conversationId,
          role: "assistant",
          content: result.content,
          providerName: result.providerName,
          model: result.model,
        },
      });
      await prisma.chatConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    }

    return apiSuccess({ ...result, conversationId });
  } catch (err) {
    if (err instanceof LLMClientError) {
      return apiError(err.message, err.status);
    }
    console.error("[api/chat] unexpected error", err);
    return apiError((err as Error).message ?? "Internal error", 500);
  }
}
