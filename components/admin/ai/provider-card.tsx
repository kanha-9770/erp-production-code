"use client";

import { useMemo, useState } from "react";
import {
  KeyRound,
  Plus,
  Star,
  StarOff,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import AddKeyDialog from "./add-key-dialog";
import type { AIProviderDTO, ProviderPresetDTO } from "./types";
import { isLocalProvider } from "@/lib/ai/local-provider";

interface Props {
  provider: AIProviderDTO;
  preset?: ProviderPresetDTO;
  onUpdate: (patch: Partial<AIProviderDTO>) => void;
  onDelete: () => void;
  onAddKey: (payload: { label: string; apiKey: string }) => void;
  onToggleKey: (keyId: string, isActive: boolean) => void;
  onDeleteKey: (keyId: string) => void;
}

export default function ProviderCard({
  provider,
  preset,
  onUpdate,
  onDelete,
  onAddKey,
  onToggleKey,
  onDeleteKey,
}: Props) {
  const [addKeyOpen, setAddKeyOpen] = useState(false);
  const [customModel, setCustomModel] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftBaseUrl, setDraftBaseUrl] = useState(provider.baseUrl);
  const [draftTemperature, setDraftTemperature] = useState(
    provider.temperature?.toString() ?? ""
  );
  const [draftMaxTokens, setDraftMaxTokens] = useState(
    provider.maxTokens?.toString() ?? ""
  );
  const [discovering, setDiscovering] = useState(false);

  const currentModels = useMemo(
    () =>
      Array.from(
        new Set([provider.defaultModel, ...provider.availableModels])
      ).filter(Boolean),
    [provider.defaultModel, provider.availableModels]
  );

  const isLocal = useMemo(
    () => isLocalProvider({ name: provider.name, baseUrl: provider.baseUrl }),
    [provider.name, provider.baseUrl]
  );

  const presetSuggestions = preset?.suggestedModels ?? [];
  const notYetAdded = presetSuggestions.filter((m) => !currentModels.includes(m));

  const addModel = (m: string) => {
    const trimmed = m.trim();
    if (!trimmed) return;
    if (provider.availableModels.includes(trimmed) || trimmed === provider.defaultModel) {
      return;
    }
    onUpdate({ availableModels: [...provider.availableModels, trimmed] });
  };

  const addCustomModel = () => {
    addModel(customModel);
    setCustomModel("");
  };

  const removeModel = (m: string) => {
    if (m === provider.defaultModel) {
      toast.error("Can't remove the default model — pick another default first");
      return;
    }
    onUpdate({
      availableModels: provider.availableModels.filter((x) => x !== m),
    });
  };

  const saveSettings = () => {
    const temp = draftTemperature === "" ? null : Number(draftTemperature);
    const maxT = draftMaxTokens === "" ? null : Number(draftMaxTokens);
    onUpdate({
      baseUrl: draftBaseUrl,
      temperature: Number.isFinite(temp as number) ? (temp as number) : null,
      maxTokens: Number.isFinite(maxT as number) ? (maxT as number) : null,
    });
    setEditing(false);
  };

  const discoverModels = async () => {
    setDiscovering(true);
    try {
      const res = await fetch(
        `/api/admin/ai/providers/${provider.id}/models`,
        { credentials: "include" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error ?? `${res.status} ${res.statusText}`);
      }
      const models: string[] = json.data?.models ?? [];
      const warning: string | undefined = json.data?.warning;
      if (warning) toast.warning(warning);

      const toAdd = models.filter(
        (m) => !provider.availableModels.includes(m) && m !== provider.defaultModel
      );
      if (toAdd.length === 0) {
        toast.info("Nothing new to add — all discovered models already in list");
      } else {
        onUpdate({
          availableModels: [...provider.availableModels, ...toAdd],
        });
        toast.success(`Added ${toAdd.length} models (${json.data?.source ?? "unknown"})`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDiscovering(false);
    }
  };

  return (
    <Card className={provider.isDefault ? "border-primary" : ""}>
      <CardContent className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{provider.displayName}</h3>
              {provider.isDefault && (
                <Badge className="bg-primary/10 text-primary border-primary/30">
                  Default
                </Badge>
              )}
              {!provider.isActive && <Badge variant="secondary">Inactive</Badge>}
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              {provider.baseUrl}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              title={provider.isDefault ? "Unset default" : "Set as default"}
              onClick={() => onUpdate({ isDefault: !provider.isDefault })}
            >
              {provider.isDefault ? (
                <StarOff className="h-4 w-4" />
              ) : (
                <Star className="h-4 w-4" />
              )}
            </Button>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Active</Label>
              <Switch
                checked={provider.isActive}
                onCheckedChange={(v) => onUpdate({ isActive: v })}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Models section */}
        <div className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <Label className="text-xs">Default model</Label>
              <Select
                value={provider.defaultModel}
                onValueChange={(v) => onUpdate({ defaultModel: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currentModels.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={discoverModels}
              disabled={discovering}
              title="Query the provider's /v1/models endpoint"
            >
              {discovering ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-1.5" />
              )}
              Discover models
            </Button>
          </div>

          {/* Current selected models */}
          <div>
            <Label className="text-[11px] text-muted-foreground">
              Selected models ({currentModels.length})
            </Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {currentModels.map((m) => {
                const isDefault = m === provider.defaultModel;
                return (
                  <Badge
                    key={m}
                    variant={isDefault ? "default" : "secondary"}
                    className={cn(
                      "gap-1.5",
                      !isDefault && "cursor-pointer hover:bg-destructive/20"
                    )}
                    onClick={() => !isDefault && removeModel(m)}
                    title={isDefault ? "Default model" : "Click to remove"}
                  >
                    {isDefault && <Star className="h-2.5 w-2.5" />}
                    {m}
                    {!isDefault && <XCircle className="h-3 w-3" />}
                  </Badge>
                );
              })}
            </div>
          </div>

          {/* Preset suggestions not yet added */}
          {notYetAdded.length > 0 && (
            <div>
              <Label className="text-[11px] text-muted-foreground">
                Suggested for {preset?.displayName ?? provider.displayName} — click to add
              </Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {notYetAdded.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => addModel(m)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors flex items-center gap-1"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add custom model */}
          <div>
            <Label className="text-[11px] text-muted-foreground">
              Add custom model id
            </Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="e.g. gpt-4o or llama3.2:70b"
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomModel();
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addCustomModel}
                disabled={!customModel.trim()}
              >
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Advanced settings */}
        <div>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Hide" : "Show"} advanced settings
          </button>
          {editing && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Base URL</Label>
                <Input
                  value={draftBaseUrl}
                  onChange={(e) => setDraftBaseUrl(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Temperature</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={draftTemperature}
                  onChange={(e) => setDraftTemperature(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Max tokens</Label>
                <Input
                  type="number"
                  min="1"
                  value={draftMaxTokens}
                  onChange={(e) => setDraftMaxTokens(e.target.value)}
                  placeholder="unset"
                />
              </div>
              <div className="md:col-span-3 flex justify-end">
                <Button size="sm" onClick={saveSettings}>
                  Save settings
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* API keys */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              API keys ({provider.apiKeys.length})
              {isLocal && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  optional
                </Badge>
              )}
            </h4>
            <Button size="sm" variant="outline" onClick={() => setAddKeyOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add key
            </Button>
          </div>
          {provider.apiKeys.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              {isLocal
                ? "No key required — self-hosted servers (Ollama, vLLM, llama.cpp, LM Studio) accept requests without auth. Add a key here only if you started the server with --api-key."
                : "No keys yet. Add at least one to enable this provider."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {provider.apiKeys.map((k) => {
                const cooling =
                  k.cooldownUntil && new Date(k.cooldownUntil).getTime() > Date.now();
                return (
                  <div
                    key={k.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-md bg-muted/40"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {k.isActive ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{k.label}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {k.keyPreview}
                        </div>
                      </div>
                      {cooling && (
                        <Badge variant="outline" className="gap-1">
                          <Clock className="h-3 w-3" />
                          cooldown
                        </Badge>
                      )}
                      {k.failureCount > 0 && (
                        <Badge
                          variant="outline"
                          className="text-amber-600 border-amber-300"
                        >
                          {k.failureCount} failures
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={k.isActive}
                        onCheckedChange={(v) => onToggleKey(k.id, v)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteKey(k.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>

      <AddKeyDialog
        open={addKeyOpen}
        onOpenChange={setAddKeyOpen}
        providerName={provider.displayName}
        onSubmit={(payload) => {
          onAddKey(payload);
          setAddKeyOpen(false);
        }}
      />
    </Card>
  );
}
