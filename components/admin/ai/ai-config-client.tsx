"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import PageBackLink from "@/components/shared/page-back-link";
import ProviderCard from "./provider-card";
import AddProviderDialog from "./add-provider-dialog";
import type { AIProviderDTO, ProviderPresetDTO, AIProviderKeyDTO } from "./types";
import { PROVIDER_PRESETS } from "@/lib/ai/provider-presets";

// Presets are a static constant bundled client-side — no fetch needed.
const PRESETS: ProviderPresetDTO[] = PROVIDER_PRESETS;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error ?? `${res.status} ${res.statusText}`);
  }
  return (json?.data ?? json) as T;
}

function tempId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function AIConfigClient() {
  const [providers, setProviders] = useState<AIProviderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Ref lets optimistic handlers capture the latest list for rollback without
  // re-creating the callback on every state update.
  const providersRef = useRef<AIProviderDTO[]>(providers);
  useEffect(() => {
    providersRef.current = providers;
  }, [providers]);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchJson<AIProviderDTO[]>("/api/admin/ai/providers");
      setProviders(list);
    } catch (err) {
      const msg = (err as Error).message;
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Create (optimistic with server-returned swap) ──────────────────────
  const handleCreate = useCallback(
    async (payload: {
      name: string;
      displayName: string;
      baseUrl: string;
      defaultModel: string;
      availableModels: string[];
      isDefault: boolean;
    }) => {
      const tmpId = tempId("tmp_provider");
      const nowIso = new Date().toISOString();
      const optimistic: AIProviderDTO = {
        id: tmpId,
        name: payload.name,
        displayName: payload.displayName,
        baseUrl: payload.baseUrl,
        defaultModel: payload.defaultModel,
        availableModels: payload.availableModels,
        isActive: true,
        isDefault: payload.isDefault,
        priority: 0,
        temperature: 0.7,
        maxTokens: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        apiKeys: [],
      };

      setProviders((prev) => {
        const next = payload.isDefault
          ? prev.map((p) => ({ ...p, isDefault: false }))
          : prev;
        return [...next, optimistic];
      });
      setAddOpen(false);

      try {
        const created = await fetchJson<AIProviderDTO>("/api/admin/ai/providers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setProviders((prev) =>
          prev.map((p) => (p.id === tmpId ? { ...created, apiKeys: [] } : p))
        );
        toast.success(`Provider "${payload.displayName}" added`);
      } catch (err) {
        setProviders((prev) => prev.filter((p) => p.id !== tmpId));
        toast.error((err as Error).message);
      }
    },
    []
  );

  // ── Update (optimistic) ────────────────────────────────────────────────
  const handleUpdate = useCallback(
    async (id: string, patch: Partial<AIProviderDTO>) => {
      const snapshot = providersRef.current;
      setProviders((prev) =>
        prev.map((p) => {
          if (p.id === id) return { ...p, ...patch };
          // Unset other defaults when setting this one as default
          if (patch.isDefault === true) return { ...p, isDefault: false };
          return p;
        })
      );

      try {
        await fetchJson(`/api/admin/ai/providers/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
      } catch (err) {
        setProviders(snapshot);
        toast.error((err as Error).message);
      }
    },
    []
  );

  // ── Delete (optimistic with rollback) ──────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this provider and all of its API keys? This cannot be undone.")) {
      return;
    }
    const snapshot = providersRef.current;
    setProviders((prev) => prev.filter((p) => p.id !== id));
    try {
      await fetchJson(`/api/admin/ai/providers/${id}`, { method: "DELETE" });
      toast.success("Provider deleted");
    } catch (err) {
      setProviders(snapshot);
      toast.error((err as Error).message);
    }
  }, []);

  // ── Add key (optimistic append, server swap) ───────────────────────────
  const handleAddKey = useCallback(
    async (providerId: string, payload: { label: string; apiKey: string }) => {
      const tmpKeyId = tempId("tmp_key");
      const preview =
        payload.apiKey.length > 8
          ? `${payload.apiKey.slice(0, 4)}…${payload.apiKey.slice(-4)}`
          : "••••";
      const optimistic: AIProviderKeyDTO = {
        id: tmpKeyId,
        label: payload.label,
        keyPreview: preview,
        isActive: true,
        lastUsedAt: null,
        failureCount: 0,
        cooldownUntil: null,
        createdAt: new Date().toISOString(),
      };

      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId ? { ...p, apiKeys: [...p.apiKeys, optimistic] } : p
        )
      );

      try {
        const created = await fetchJson<AIProviderKeyDTO>(
          `/api/admin/ai/providers/${providerId}/keys`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );
        setProviders((prev) =>
          prev.map((p) =>
            p.id === providerId
              ? {
                  ...p,
                  apiKeys: p.apiKeys.map((k) => (k.id === tmpKeyId ? created : k)),
                }
              : p
          )
        );
        toast.success("API key added");
      } catch (err) {
        setProviders((prev) =>
          prev.map((p) =>
            p.id === providerId
              ? {
                  ...p,
                  apiKeys: p.apiKeys.filter((k) => k.id !== tmpKeyId),
                }
              : p
          )
        );
        toast.error((err as Error).message);
      }
    },
    []
  );

  // ── Toggle key (optimistic) ────────────────────────────────────────────
  const handleToggleKey = useCallback(
    async (providerId: string, keyId: string, isActive: boolean) => {
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? {
                ...p,
                apiKeys: p.apiKeys.map((k) =>
                  k.id === keyId
                    ? {
                        ...k,
                        isActive,
                        failureCount: isActive ? 0 : k.failureCount,
                        cooldownUntil: isActive ? null : k.cooldownUntil,
                      }
                    : k
                ),
              }
            : p
        )
      );

      try {
        await fetchJson(`/api/admin/ai/providers/${providerId}/keys/${keyId}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive }),
        });
      } catch (err) {
        // Rollback just this key
        setProviders((prev) =>
          prev.map((p) =>
            p.id === providerId
              ? {
                  ...p,
                  apiKeys: p.apiKeys.map((k) =>
                    k.id === keyId ? { ...k, isActive: !isActive } : k
                  ),
                }
              : p
          )
        );
        toast.error((err as Error).message);
      }
    },
    []
  );

  // ── Delete key (optimistic with rollback) ──────────────────────────────
  const handleDeleteKey = useCallback(
    async (providerId: string, keyId: string) => {
      if (!confirm("Delete this API key?")) return;
      const snapshot = providersRef.current;
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? { ...p, apiKeys: p.apiKeys.filter((k) => k.id !== keyId) }
            : p
        )
      );
      try {
        await fetchJson(`/api/admin/ai/providers/${providerId}/keys/${keyId}`, {
          method: "DELETE",
        });
      } catch (err) {
        setProviders(snapshot);
        toast.error((err as Error).message);
      }
    },
    []
  );

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-1.5">
          <PageBackLink href="/admin" label="Admin" />
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
            AI Providers
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Configure cloud LLM providers, rotate multiple API keys per provider, and pick
            which model the chatbot uses. All providers must expose an OpenAI-compatible{" "}
            <code className="text-xs break-all">POST /v1/chat/completions</code> endpoint.
          </p>
        </div>
        <div className="flex gap-2 shrink-0 sm:self-start">
          <Button
            variant="outline"
            size="sm"
            onClick={reload}
            disabled={loading}
            className="flex-1 sm:flex-none"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            className="flex-1 sm:flex-none"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add provider
          </Button>
        </div>
      </div>

      {loadError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-destructive">
                Couldn't load providers
              </p>
              <p className="text-xs text-destructive/80 whitespace-pre-wrap">
                {loadError}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={reload}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {loading && providers.length === 0 && !loadError ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading providers…
          </CardContent>
        </Card>
      ) : providers.length === 0 && !loadError ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-muted-foreground">
              No AI providers configured yet. Add one to get started.
            </p>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add your first provider
            </Button>
          </CardContent>
        </Card>
      ) : providers.length > 0 ? (
        <div className="grid gap-4">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              preset={PRESETS.find((pr) => pr.name === p.name)}
              onUpdate={(patch) => handleUpdate(p.id, patch)}
              onDelete={() => handleDelete(p.id)}
              onAddKey={(payload) => handleAddKey(p.id, payload)}
              onToggleKey={(keyId, isActive) => handleToggleKey(p.id, keyId, isActive)}
              onDeleteKey={(keyId) => handleDeleteKey(p.id, keyId)}
            />
          ))}
        </div>
      ) : null}

      <AddProviderDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        presets={PRESETS}
        existingNames={providers.map((p) => p.name)}
        onSubmit={handleCreate}
      />
    </div>
  );
}
