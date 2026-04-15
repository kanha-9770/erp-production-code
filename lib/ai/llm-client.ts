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
import {
  isLocalProvider,
  normalizeLocalBaseUrl,
  describeUpstreamError,
  SYNTHETIC_LOCAL_KEY_ID,
  SYNTHETIC_LOCAL_KEY_PLAINTEXT,
} from "./local-provider";

const MAX_KEY_ATTEMPTS = 5;
const MAX_TOOL_ROUNDS = 5;

/**
 * Local providers (Ollama/vLLM/llama.cpp/LM Studio) don't need a real API key.
 * When the admin hasn't stored one, fall back to a synthetic placeholder so
 * the OpenAI SDK's Authorization header is non-empty (the upstream ignores it).
 */
function synthesizeLocalKey(): ResolvedKey {
  return {
    id: SYNTHETIC_LOCAL_KEY_ID,
    label: "local (no key)",
    plaintext: SYNTHETIC_LOCAL_KEY_PLAINTEXT,
    keyPreview: "local",
  };
}

async function pickKeyOrSynthesize(
  provider: ResolvedProvider
): Promise<ResolvedKey | null> {
  const real = await pickKey(provider.id);
  if (real) return real;
  if (isLocalProvider(provider)) return synthesizeLocalKey();
  return null;
}

function rowToResolved(row: {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  defaultModel: string;
  availableModels: unknown;
  temperature: number | null;
  maxTokens: number | null;
}): ResolvedProvider {
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

  return rowToResolved(row);
}

/**
 * Returns an ordered chain of providers for this organization. The first
 * entry is the user-preferred one (or the default), and the remainder are
 * the other active providers sorted by isDefault / priority / age. This
 * powers auto-failover — when a cloud provider returns a terminal error
 * (billing, auth, invalid model, network down), the caller can walk the
 * chain and retry on the next provider without user intervention.
 *
 * If `providerId` is given but doesn't match an active provider, we throw —
 * the user explicitly asked for it and silently picking a different one
 * would be surprising.
 */
async function resolveProviderChain(
  organizationId: string,
  providerId?: string
): Promise<ResolvedProvider[]> {
  const rows = await prisma.aIProvider.findMany({
    where: { organizationId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { priority: "desc" }, { createdAt: "asc" }],
  });

  if (rows.length === 0) {
    throw new LLMClientError(
      "No active AI provider is configured for this organization",
      404
    );
  }

  let preferred: (typeof rows)[number] | undefined;
  if (providerId) {
    preferred = rows.find((r) => r.id === providerId);
    if (!preferred) {
      throw new LLMClientError(
        "Requested AI provider not found or inactive",
        404
      );
    }
  } else {
    preferred = rows[0];
  }

  const rest = rows.filter((r) => r.id !== preferred!.id);
  return [preferred!, ...rest].map(rowToResolved);
}

function makeClient(provider: ResolvedProvider, key: ResolvedKey): OpenAI {
  // For local providers, rewrite "localhost" → "127.0.0.1" to dodge Node 18+
  // dual-stack IPv6 resolution (::1) vs typical IPv4-only bind (0.0.0.0/127.0.0.1).
  const baseURL = isLocalProvider(provider)
    ? normalizeLocalBaseUrl(provider.baseUrl)
    : provider.baseUrl;
  return new OpenAI({
    apiKey: key.plaintext,
    baseURL,
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
  // Resolve the full chain so we can failover between providers in addition
  // to rotating across keys within each provider.
  const chain = await resolveProviderChain(organizationId, req.providerId);
  const primary = chain[0];
  const topModel = req.model ?? primary.defaultModel;

  const failureTrail: Array<{ provider: string; reason: string }> = [];

  for (let providerIdx = 0; providerIdx < chain.length; providerIdx++) {
    const provider = chain[providerIdx];
    const isFallback = providerIdx > 0;
    const model = isFallback ? provider.defaultModel : topModel;

    let lastErr: unknown = null;

    for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt++) {
      const key = await pickKeyOrSynthesize(provider);
      if (!key) {
        failureTrail.push({
          provider: provider.displayName,
          reason: "no usable API key",
        });
        break;
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
        if (kind !== "other") await markFailure(provider.id, key.id, kind);
        // "other" errors (400 billing, bad request, etc.) — no point
        // retrying with another key on the same provider.
        if (kind === "other") break;
      }
    }

    // Successes return inside the inner loop; reaching here means every
    // key on this provider failed. Record and move on to the next provider.
    if (lastErr) {
      const reason = describeUpstreamError(lastErr, provider.baseUrl).split(
        "\n"
      )[0];
      failureTrail.push({ provider: provider.displayName, reason });
    }
  }

  const trailSummary = failureTrail
    .map((f, i) => `${i + 1}. ${f.provider}: ${f.reason}`)
    .join(" | ");
  throw new LLMClientError(
    `All ${chain.length} configured AI provider(s) failed: ${trailSummary}`,
    502,
    primary.name
  );
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
  // Resolve the full failover chain. First entry is the user's selection
  // (or the default); the rest are backups in priority order. If the first
  // provider fails before streaming any tokens — e.g. Anthropic returns
  // "credit balance too low" — we walk the chain and retry on the next one.
  const chain = await resolveProviderChain(organizationId, req.providerId);
  const primary = chain[0];
  const model = req.model ?? primary.defaultModel;
  const enableTools = !!userCtx;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      const emitDone = () => {
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      };

      // Track whether we've already streamed anything to the client. Once
      // tokens start flowing from a provider, we can't failover — the user
      // would see a jarring mid-sentence switch. Failover only happens on
      // errors that occur before any delta has been emitted.
      let hasEmittedUserFacingContent = false;
      const originalMessages = req.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Track provider failures across the chain so we can give a helpful
      // final error if EVERY provider bailed.
      const failureTrail: Array<{ provider: string; reason: string }> = [];

      for (let providerIdx = 0; providerIdx < chain.length; providerIdx++) {
        const provider = chain[providerIdx];
        const isFallback = providerIdx > 0;
        const providerModel =
          // Only use the request's model on the primary. Fallbacks have
          // their own model names — e.g. "claude-sonnet-4-5" isn't valid
          // on Ollama — so prefer the fallback provider's defaultModel.
          isFallback ? provider.defaultModel : model;

        const key = await pickKeyOrSynthesize(provider);
        if (!key) {
          failureTrail.push({
            provider: provider.displayName,
            reason: "no usable API key",
          });
          continue;
        }
        const client = makeClient(provider, key);

        // Reset the message buffer for this provider. If a previous provider
        // partially mutated it with tool calls before failing, we don't want
        // that state bleeding into the next provider's run.
        const messageBuffer: Array<Record<string, unknown>> = originalMessages.map(
          (m) => ({ ...m })
        );

        // If this is a fallback attempt, tell the user inline so they see
        // which provider actually answered. Once we emit this delta,
        // `hasEmittedUserFacingContent` flips — so an error after this
        // point is fatal to the stream.
        if (isFallback) {
          const reasonLine =
            failureTrail[failureTrail.length - 1]?.reason ?? "upstream failure";
          emit({
            delta:
              `⚠️ Primary provider (${chain[0].displayName}) failed: ${reasonLine}. ` +
              `Retrying with ${provider.displayName}…\n\n`,
          });
          hasEmittedUserFacingContent = true;
        }

        try {
          let round = 0;
          while (round < MAX_TOOL_ROUNDS) {
            round++;

            const createArgs: Record<string, unknown> = {
              model: providerModel,
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
            const upstream = await client.chat.completions.create(
              createArgs as any
            );

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
                hasEmittedUserFacingContent = true;
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
              finishReason === "tool_calls" &&
              toolCalls.length > 0 &&
              toolCalls.some((t) => t?.name);

            if (!hasToolCalls) {
              // Final answer already streamed — success.
              markSuccess(provider.id, key.id);
              emitDone();
              controller.close();
              return;
            }

            // Tool-call round. Append assistant message with tool_calls,
            // then execute each tool and append its result.
            messageBuffer.push({
              role: "assistant",
              content: roundContent || null,
              tool_calls: toolCalls.map((t) => ({
                id: t.id || `call_${Math.random().toString(36).slice(2, 10)}`,
                type: "function",
                function: { name: t.name, arguments: t.arguments || "{}" },
              })),
            });

            // A tool call event also counts as user-facing output.
            hasEmittedUserFacingContent = true;

            const validCalls = toolCalls.filter((t) => t?.name);
            for (const tc of validCalls) {
              emit({ tool: { name: tc.name, status: "calling" } });
            }

            const results = await Promise.all(
              validCalls.map(async (tc) => {
                if (!userCtx) {
                  return {
                    error: "No user context available for tool execution",
                  };
                }
                try {
                  return await executeTool(tc.name, tc.arguments || "{}", userCtx);
                } catch (err) {
                  return {
                    error: (err as Error).message ?? "Tool execution failed",
                  };
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

          // Exited via MAX_TOOL_ROUNDS on this provider — tell the user and
          // stop (this is not a failure we want to failover on).
          emit({
            delta:
              "\n\n(I reached the maximum number of tool-call rounds and stopped. Please rephrase.)",
          });
          emitDone();
          controller.close();
          return;
        } catch (err) {
          const kind = classifyError(err);
          if (kind !== "other") markFailure(provider.id, key.id, kind);

          const detail = describeUpstreamError(err, provider.baseUrl);
          console.error(
            `[chatStream] upstream failure provider=${provider.name} baseUrl=${provider.baseUrl} hasEmitted=${hasEmittedUserFacingContent}:`,
            err
          );

          failureTrail.push({
            provider: provider.displayName,
            reason: detail.split("\n")[0], // first line only for the trail
          });

          if (hasEmittedUserFacingContent) {
            // Already streamed tokens from this provider — can't failover
            // mid-answer without corrupting the output. Surface the error
            // and stop.
            emit({ error: detail });
            emitDone();
            controller.close();
            return;
          }

          // Otherwise, we haven't emitted anything yet. Loop continues and
          // tries the next provider in the chain.
          continue;
        }
      }

      // Exhausted the whole chain without ever streaming a successful
      // response. Give the user a compact trail so they know which
      // providers were attempted and why each one failed.
      const trailSummary = failureTrail
        .map((f, i) => `  ${i + 1}. ${f.provider}: ${f.reason}`)
        .join("\n");
      emit({
        error:
          `All ${chain.length} configured AI provider(s) failed:\n${trailSummary}\n\n` +
          `Fixes:\n` +
          `  • For billing errors, either top up the account linked to the API key OR switch to a local provider (Ollama/vLLM) in Admin → AI Config.\n` +
          `  • For connection errors on local providers, make sure the server is running (curl the baseUrl/models endpoint to test).\n` +
          `  • For auth errors, rotate or replace the API key in Admin → AI Config.`,
      });
      emitDone();
      controller.close();
    },
  });

  return { stream, providerName: primary.displayName, model };
}
