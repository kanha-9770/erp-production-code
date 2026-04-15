/**
 * LLMClient — orchestrator in front of any OpenAI-compatible upstream.
 *
 * Responsibilities:
 *   - Resolve a provider for this organization (specific id, default, or first active)
 *   - Ask the key rotator for a key, run the request, and on 401/429/5xx
 *     failover to the next key
 *   - Expose streaming chat with multi-round tool calling
 *
 * Tool-calling flow (runs inside chatStream when tools are provided):
 *   1. Open a stream with tools=[...] and tool_choice="auto"
 *   2. Accumulate both content deltas and tool_call deltas
 *   3. If stream ends with finish_reason === "tool_calls":
 *        a. Execute every tool call via executeTool()
 *        b. Append the assistant tool_calls + each tool result to messages
 *        c. Loop back to step 1
 *   4. Otherwise: the final content has been streamed, we're done
 */

import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { pickKey, markSuccess, markFailure } from "./key-rotator";
import { LLMClientError } from "./types";
import type { ChatRequest, ResolvedProvider, ResolvedKey } from "./types";
import { TOOL_DEFINITIONS, executeTool } from "./tools";
import type { UserContext } from "./context-builder";

const MAX_KEY_ATTEMPTS = 5;
const MAX_TOOL_ROUNDS = 5;

async function resolveProvider(
  organizationId: string,
  providerId?: string
): Promise<ResolvedProvider> {
  const where = providerId
    ? { id: providerId, organizationId, isActive: true }
    : { organizationId, isActive: true };

  const row = providerId
    ? await prisma.aIProvider.findFirst({ where })
    : (await prisma.aIProvider.findFirst({
        where: { ...where, isDefault: true },
      })) ??
      (await prisma.aIProvider.findFirst({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      }));

  if (!row) {
    throw new LLMClientError(
      providerId
        ? "Requested AI provider not found or inactive"
        : "No active AI provider is configured for this organization",
      404
    );
  }

  const availableModels = Array.isArray(row.availableModels)
    ? (row.availableModels as unknown as string[])
    : [];

  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    baseUrl: row.baseUrl,
    defaultModel: row.defaultModel,
    availableModels,
    temperature: row.temperature,
    maxTokens: row.maxTokens,
  };
}

function makeClient(provider: ResolvedProvider, key: ResolvedKey): OpenAI {
  return new OpenAI({
    apiKey: key.plaintext,
    baseURL: provider.baseUrl,
  });
}

function classifyError(err: unknown): "auth" | "rate_limit" | "server" | "other" {
  const anyErr = err as { status?: number; code?: string };
  const status = anyErr?.status;
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (typeof status === "number" && status >= 500) return "server";
  return "other";
}

// ── Non-streaming chat (no tools) ─────────────────────────────────────────
export async function chat(
  organizationId: string,
  req: ChatRequest
): Promise<{
  content: string;
  model: string;
  providerName: string;
  keyPreview: string;
}> {
  const provider = await resolveProvider(organizationId, req.providerId);
  const model = req.model ?? provider.defaultModel;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt++) {
    const key = await pickKey(provider.id);
    if (!key) {
      throw new LLMClientError(
        `No usable API keys for provider "${provider.displayName}"`,
        503,
        provider.name
      );
    }
    const client = makeClient(provider, key);
    try {
      const resp = await client.chat.completions.create({
        model,
        messages: req.messages,
        temperature: req.temperature ?? provider.temperature ?? undefined,
        max_tokens: req.maxTokens ?? provider.maxTokens ?? undefined,
        stream: false,
      });
      await markSuccess(provider.id, key.id);
      return {
        content: resp.choices[0]?.message?.content ?? "",
        model,
        providerName: provider.displayName,
        keyPreview: key.keyPreview,
      };
    } catch (err) {
      lastErr = err;
      const kind = classifyError(err);
      if (kind === "other") break;
      await markFailure(provider.id, key.id, kind);
    }
  }
  const msg = (lastErr as Error)?.message ?? "Upstream chat completion failed";
  throw new LLMClientError(msg, 502, provider.name);
}

// ── Streaming chat with multi-round tool calling ──────────────────────────
// Messages passed in here are the OpenAI-compat shape; we mutate a local copy
// as tool calls/results get appended across rounds.
interface ToolCallAcc {
  id: string;
  name: string;
  arguments: string;
}

export async function chatStream(
  organizationId: string,
  req: ChatRequest,
  userCtx?: UserContext
): Promise<{
  stream: ReadableStream<Uint8Array>;
  providerName: string;
  model: string;
}> {
  const provider = await resolveProvider(organizationId, req.providerId);
  const model = req.model ?? provider.defaultModel;
  const enableTools = !!userCtx;

  // Pick ONE key for the whole stream (multi-round tool calling uses the same
  // connection path). On failure, we surface the error — retry across keys
  // happens at the per-round level inside the generator.
  let key = await pickKey(provider.id);
  if (!key) {
    throw new LLMClientError(
      `No usable API keys for provider "${provider.displayName}"`,
      503,
      provider.name
    );
  }
  const client = makeClient(provider, key);

  const encoder = new TextEncoder();

  // Copy the caller's messages into a mutable buffer; we append tool messages
  // as the conversation evolves across tool-call rounds.
  // Prisma / our internal shape uses { role, content }; OpenAI's SDK accepts
  // that plus additional fields for tool messages.
  const messageBuffer: Array<Record<string, unknown>> = req.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      const emitDone = () => {
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      };

      let round = 0;
      try {
        while (round < MAX_TOOL_ROUNDS) {
          round++;

          const createArgs: Record<string, unknown> = {
            model,
            messages: messageBuffer,
            temperature: req.temperature ?? provider.temperature ?? undefined,
            max_tokens: req.maxTokens ?? provider.maxTokens ?? undefined,
            stream: true,
          };
          if (enableTools) {
            createArgs.tools = TOOL_DEFINITIONS;
            createArgs.tool_choice = "auto";
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const upstream = await client.chat.completions.create(createArgs as any);

          let roundContent = "";
          const toolCalls: ToolCallAcc[] = [];
          let finishReason: string | null = null;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for await (const chunk of upstream as any) {
            const choice = chunk?.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta ?? {};
            if (choice.finish_reason) finishReason = choice.finish_reason;

            if (typeof delta.content === "string" && delta.content.length > 0) {
              roundContent += delta.content;
              emit({ delta: delta.content });
            }

            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = typeof tc.index === "number" ? tc.index : 0;
                if (!toolCalls[idx]) {
                  toolCalls[idx] = { id: "", name: "", arguments: "" };
                }
                if (tc.id) toolCalls[idx].id = tc.id;
                if (tc.function?.name) toolCalls[idx].name += tc.function.name;
                if (tc.function?.arguments) {
                  toolCalls[idx].arguments += tc.function.arguments;
                }
              }
            }
          }

          const hasToolCalls =
            finishReason === "tool_calls" && toolCalls.length > 0 && toolCalls.some((t) => t?.name);

          if (!hasToolCalls) {
            // Final answer already streamed
            markSuccess(provider.id, key.id);
            emitDone();
            controller.close();
            return;
          }

          // Tool-call round. Append assistant message with tool_calls, then
          // execute each tool and append its result.
          messageBuffer.push({
            role: "assistant",
            content: roundContent || null,
            tool_calls: toolCalls.map((t) => ({
              id: t.id || `call_${Math.random().toString(36).slice(2, 10)}`,
              type: "function",
              function: { name: t.name, arguments: t.arguments || "{}" },
            })),
          });

          // Execute every tool call for this round in PARALLEL.
          // When the LLM emits multiple tool_calls in one response (which the
          // system prompt now explicitly encourages), running them sequentially
          // was adding Σ(handler_latency) to every round. Parallel execution
          // collapses that to max(handler_latency).
          const validCalls = toolCalls.filter((t) => t?.name);
          for (const tc of validCalls) {
            emit({ tool: { name: tc.name, status: "calling" } });
          }

          const results = await Promise.all(
            validCalls.map(async (tc) => {
              if (!userCtx) {
                return { error: "No user context available for tool execution" };
              }
              try {
                return await executeTool(tc.name, tc.arguments || "{}", userCtx);
              } catch (err) {
                return { error: (err as Error).message ?? "Tool execution failed" };
              }
            })
          );

          for (let idx = 0; idx < validCalls.length; idx++) {
            const tc = validCalls[idx];
            emit({ tool: { name: tc.name, status: "done" } });
            messageBuffer.push({
              role: "tool",
              tool_call_id:
                tc.id || `call_${Math.random().toString(36).slice(2, 10)}`,
              content: JSON.stringify(results[idx]),
            });
          }

          // Loop — the LLM will see tool results and continue.
        }

        // If we exited the loop via MAX_TOOL_ROUNDS, tell the user.
        emit({
          delta:
            "\n\n(I reached the maximum number of tool-call rounds and stopped. Please rephrase.)",
        });
        emitDone();
        controller.close();
      } catch (err) {
        const kind = classifyError(err);
        if (kind !== "other") markFailure(provider.id, key.id, kind);
        emit({ error: (err as Error).message ?? "Upstream stream failed" });
        emitDone();
        controller.close();
      }
    },
  });

  return { stream, providerName: provider.displayName, model };
}
