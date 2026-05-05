import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
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

interface AttachmentRef {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  kind?: string;
}

/**
 * Inline a text-like attachment's content into the user prompt so the LLM
 * can analyse it. For binary types (image/audio/video/zip/etc.) we only
 * append a reference line — true multimodal handling lives at the provider
 * layer and is not wired here.
 */
const TEXT_INLINE_BUDGET_BYTES = 16 * 1024; // per file
const TOTAL_INLINE_BUDGET_BYTES = 48 * 1024; // across the whole message

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function isTextLike(mime: string, name: string): boolean {
  if (!mime) return false;
  if (mime.startsWith("text/")) return true;
  if (
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/yaml" ||
    mime === "application/x-yaml"
  )
    return true;
  // Some browsers send application/octet-stream for code files; fall back to
  // an extension sniff so we can still inline them.
  if (
    /\.(txt|md|csv|tsv|json|xml|yaml|yml|log|html|htm|css|js|ts|tsx|jsx|py|rb|go|rs|java|c|cpp|h|sh|sql|env|conf|ini|toml)$/i.test(
      name
    )
  )
    return true;
  return false;
}

function languageHint(name: string): string {
  const ext = path.extname(name).slice(1).toLowerCase();
  if (!ext) return "";
  if (["js", "jsx"].includes(ext)) return "javascript";
  if (["ts", "tsx"].includes(ext)) return "typescript";
  if (ext === "py") return "python";
  if (ext === "rb") return "ruby";
  if (ext === "md") return "markdown";
  if (ext === "yml" || ext === "yaml") return "yaml";
  if (ext === "csv" || ext === "tsv") return ext;
  if (ext === "html" || ext === "htm") return "html";
  return ext;
}

/**
 * Reads the upload back from disk. We trust `userId` to scope the path so a
 * forged URL pointing at another user's directory is silently dropped.
 */
async function readAttachmentText(
  url: string,
  userId: string,
  maxBytes: number
): Promise<string | null> {
  // Expected shape: /uploads/chat/<userId>/<uuid>.<ext>
  const expectedPrefix = `/uploads/chat/${userId}/`;
  if (!url.startsWith(expectedPrefix)) return null;
  // Strip the prefix and reject any path traversal.
  const rel = url.slice(expectedPrefix.length);
  if (rel.includes("..") || rel.includes("/") || rel.includes("\\")) return null;
  try {
    const full = path.join(process.cwd(), "public", "uploads", "chat", userId, rel);
    const buf = await readFile(full);
    const slice = buf.subarray(0, maxBytes);
    return slice.toString("utf8");
  } catch {
    return null;
  }
}

async function enrichWithAttachments(
  baseText: string,
  attachments: AttachmentRef[],
  userId: string
): Promise<string> {
  if (!attachments.length) return baseText;

  const lines: string[] = [];
  lines.push(baseText.trim());
  lines.push("");
  lines.push("---");
  lines.push(`### Attached files (${attachments.length})`);
  for (const a of attachments) {
    lines.push(`- **${a.name}** — ${a.mimeType || "unknown"}, ${formatBytes(a.size)} (${a.url})`);
  }
  lines.push("");

  let totalUsed = 0;
  for (const a of attachments) {
    if (!isTextLike(a.mimeType, a.name)) {
      // Non-text: just leave the reference. Audio/video/image/binary go to
      // the LLM as a URL + mime so it can describe what's there or call a
      // future transcription tool.
      continue;
    }
    if (totalUsed >= TOTAL_INLINE_BUDGET_BYTES) {
      lines.push(`> Skipped inlining "${a.name}" — combined budget reached.`);
      continue;
    }
    const remaining = TOTAL_INLINE_BUDGET_BYTES - totalUsed;
    const budget = Math.min(TEXT_INLINE_BUDGET_BYTES, remaining);
    const text = await readAttachmentText(a.url, userId, budget);
    if (text == null) {
      lines.push(`> Could not read "${a.name}" from disk.`);
      continue;
    }
    const truncated = a.size > budget;
    lines.push("");
    lines.push(`#### ${a.name}`);
    lines.push("```" + languageHint(a.name));
    lines.push(text);
    lines.push("```");
    if (truncated) {
      lines.push(`> Truncated at ${formatBytes(budget)} of ${formatBytes(a.size)}.`);
    }
    totalUsed += text.length;
  }

  return lines.join("\n");
}

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
      attachments?: AttachmentRef[];
    };
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return apiError("messages array is required", 400);
    }

    // Inline attachment content into the last user message before anything
    // else looks at it (persistence + LLM both see the enriched text).
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    if (attachments.length > 0) {
      const lastIdx = body.messages.length - 1;
      const last = body.messages[lastIdx];
      if (last?.role === "user") {
        const enriched = await enrichWithAttachments(
          last.content ?? "",
          attachments,
          user.id
        );
        body.messages[lastIdx] = { ...last, content: enriched };
      }
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
        try {
          await Promise.all(writes);
        } catch (err) {
          console.error("[api/chat] failed to persist user message", err);
          return apiError("Failed to save message", 500);
        }
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
            // Surface provider errors (LLMClientError is user-actionable) to
            // the client; hide anything else behind a generic message so we
            // don't leak internal stack traces or DB identifiers. Full detail
            // still goes to the server log for debugging.
            const clientError =
              err instanceof LLMClientError
                ? err.message
                : "Stream failed. Please try again.";
            console.error("[api/chat] stream error", err);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: clientError })}\n\n`
              )
            );
            controller.close();
          } finally {
            if (conversationId && assembled) {
              try {
                await prisma.chatMessage.create({
                  data: {
                    conversationId,
                    role: "assistant",
                    content: assembled,
                    providerName,
                    model,
                  },
                });
                await prisma.chatConversation.update({
                  where: { id: conversationId },
                  data: { updatedAt: new Date() },
                });
              } catch (e) {
                console.error("[api/chat] failed to persist assistant message", e);
              }
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
    // Unknown errors (DB, runtime, etc.) can contain schema/identifier info
    // that shouldn't reach the client. Log the detail, return a generic body.
    console.error("[api/chat] unexpected error", err);
    return apiError("Internal server error", 500);
  }
}
