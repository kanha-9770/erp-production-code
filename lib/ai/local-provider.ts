/**
 * Detects whether an AI provider row points at a self-hosted / local server
 * (Ollama, vLLM, llama.cpp, LM Studio, …) as opposed to a cloud service.
 *
 * Local providers don't require an API key — the OpenAI SDK still needs a
 * non-empty string for the Authorization header, but the upstream ignores it.
 * Treating these providers the same as cloud ones (key required, rotator
 * stored) breaks the "just spin up Ollama and chat" flow, so we special-case
 * them in two places:
 *   1. /api/chat/providers — list local providers even when no keys exist
 *   2. lib/ai/llm-client    — synthesize a placeholder key at request time
 */

const LOCAL_PRESET_NAMES = new Set([
  "ollama",
  "vllm",
  "llamacpp",
  "lmstudio",
]);

const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "host.docker.internal",
]);

export const SYNTHETIC_LOCAL_KEY_ID = "__local_synthetic__";
export const SYNTHETIC_LOCAL_KEY_PLAINTEXT = "local-no-key";

export function isLocalProviderName(name: string): boolean {
  return LOCAL_PRESET_NAMES.has(name.toLowerCase());
}

export function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    const host = u.hostname.toLowerCase();
    if (LOCAL_HOSTNAMES.has(host)) return true;
    if (host.endsWith(".local")) return true;
    // RFC1918 private ranges
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

export function isLocalProvider(p: {
  name: string;
  baseUrl: string;
}): boolean {
  return isLocalProviderName(p.name) || isLocalBaseUrl(p.baseUrl);
}

export function isSyntheticLocalKey(keyId: string): boolean {
  return keyId === SYNTHETIC_LOCAL_KEY_ID;
}

/**
 * Node 18+ resolves "localhost" to ::1 (IPv6 loopback) first via dns.lookup,
 * but Ollama/vLLM/llama.cpp commonly bind to 127.0.0.1 (IPv4 only). undici's
 * fetch then throws ECONNREFUSED and the OpenAI SDK surfaces it as a generic
 * "Connection error." with no detail. Rewriting to 127.0.0.1 makes the
 * connection deterministic on both stacks.
 *
 * Only touches loopback hostnames — cloud URLs, private LAN IPs, and
 * host.docker.internal are passed through unchanged.
 */
export function normalizeLocalBaseUrl(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    if (u.hostname.toLowerCase() === "localhost") {
      u.hostname = "127.0.0.1";
      return u.toString().replace(/\/$/, "");
    }
    return baseUrl;
  } catch {
    return baseUrl;
  }
}

/**
 * OpenAI SDK wraps every network failure in a generic `APIConnectionError`
 * ("Connection error.") and stashes the real culprit on `.cause`. undici sets
 * `.cause.code` to things like ECONNREFUSED, ENOTFOUND, EAI_AGAIN, ETIMEDOUT.
 * This helper pulls the actual root cause out so the user sees something
 * actionable instead of a black box.
 */
export function describeUpstreamError(err: unknown, baseUrl: string): string {
  const e = err as {
    message?: string;
    status?: number;
    code?: string;
    type?: string;
    error?: { message?: string; code?: string; type?: string };
    cause?: { code?: string; message?: string; errno?: string };
    errors?: Array<{ code?: string; message?: string }>;
  };

  // Explicit HTTP status from the upstream — keep as-is, but surface the
  // body-level error message (providers put the real reason there) and
  // detect well-known billing/quota failures that would otherwise look like
  // a mysterious "HTTP 400".
  if (typeof e?.status === "number" && e.status > 0) {
    const bodyMessage =
      e.error?.message ?? e.message ?? "Upstream error";
    const lower = bodyMessage.toLowerCase();

    const looksLikeBilling =
      e.status === 402 ||
      e.error?.code === "insufficient_quota" ||
      e.error?.type === "insufficient_quota" ||
      /credit balance/.test(lower) ||
      /insufficient.+(quota|credit|balance|funds)/.test(lower) ||
      /(exceeded|hit).+quota/.test(lower) ||
      /billing|payment required|account.+paused/.test(lower);

    if (looksLikeBilling) {
      return (
        `${bodyMessage}\n\n` +
        `This is a billing response from ${baseUrl} — the provider's servers ` +
        `returned it, the ERP can't bypass it. Things to check:\n` +
        `  • API credits vs consumer subscription are separate products — ` +
        `verify the account linked to this API key actually has API credits ` +
        `(not just a Pro/Plus chat subscription).\n` +
        `  • The API key may belong to a different workspace / org than the ` +
        `one with credits. Re-check the key in the provider's console.\n` +
        `  • Workspace spend limits set to $0 produce this same error.\n` +
        `  • Switch to a different provider in the chatbot dropdown ` +
        `(your local Ollama / vLLM provider, if configured, has no billing).`
      );
    }

    if (e.status === 401 || e.status === 403) {
      return (
        `${bodyMessage} (HTTP ${e.status}) — the API key stored for this ` +
        `provider was rejected. Rotate or replace it in Admin → AI Config.`
      );
    }

    if (e.status === 429) {
      return (
        `${bodyMessage} (HTTP 429) — rate-limited. Wait a moment and retry, ` +
        `or add additional keys so the rotator can failover.`
      );
    }

    return `${bodyMessage} (HTTP ${e.status})`;
  }

  // undici fetch failure chain
  const causeCode =
    e?.cause?.code ??
    e?.code ??
    e?.errors?.[0]?.code ??
    e?.cause?.errno;

  if (causeCode) {
    switch (causeCode) {
      case "ECONNREFUSED":
        return `Cannot reach ${baseUrl} — nothing is listening on that host/port. Is the local server running? Try: curl ${baseUrl}/models`;
      case "ENOTFOUND":
      case "EAI_AGAIN":
        return `DNS lookup failed for ${baseUrl}. Check the hostname in the provider Base URL.`;
      case "ETIMEDOUT":
      case "UND_ERR_CONNECT_TIMEOUT":
        return `Connection to ${baseUrl} timed out. The local server may be loading the model — wait and retry, or check firewall rules.`;
      case "ECONNRESET":
        return `Connection to ${baseUrl} was reset mid-request. The local server likely crashed or OOM'd on model load.`;
      case "CERT_HAS_EXPIRED":
      case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      case "SELF_SIGNED_CERT_IN_CHAIN":
        return `TLS certificate problem for ${baseUrl}: ${causeCode}`;
      default:
        return `Network error talking to ${baseUrl}: ${causeCode}${
          e.cause?.message ? ` — ${e.cause.message}` : ""
        }`;
    }
  }

  return e?.message ?? "Unknown upstream error";
}
