"use client";

import { useEffect, useMemo, useState } from "react";
import { Cloud, HardDrive, Loader2, Search, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ProviderPresetDTO } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presets: ProviderPresetDTO[];
  existingNames: string[];
  onSubmit: (payload: {
    name: string;
    displayName: string;
    baseUrl: string;
    defaultModel: string;
    availableModels: string[];
    isDefault: boolean;
  }) => void;
}

const LOCAL_PRESETS = new Set(["ollama", "vllm", "llamacpp", "lmstudio", "custom"]);

export default function AddProviderDialog({
  open,
  onOpenChange,
  presets,
  existingNames,
  onSubmit,
}: Props) {
  const available = useMemo(
    () =>
      presets.filter(
        (p) => p.name === "custom" || !existingNames.includes(p.name)
      ),
    [presets, existingNames]
  );

  const cloudPresets = available.filter((p) => !LOCAL_PRESETS.has(p.name));
  const localPresets = available.filter((p) => LOCAL_PRESETS.has(p.name));

  const [presetName, setPresetName] = useState<string>("");
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [testApiKey, setTestApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [customModel, setCustomModel] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [modelFilter, setModelFilter] = useState("");

  useEffect(() => {
    if (!open) {
      setPresetName("");
      setName("");
      setDisplayName("");
      setBaseUrl("");
      setTestApiKey("");
      setDefaultModel("");
      setAvailableModels([]);
      setCustomModel("");
      setIsDefault(false);
      setDiscoveredModels([]);
      setModelFilter("");
    }
  }, [open]);

  const applyPreset = (pname: string) => {
    setPresetName(pname);
    const p = presets.find((x) => x.name === pname);
    if (!p) return;
    const unique =
      p.name === "custom" && existingNames.includes("custom")
        ? `custom-${existingNames.filter((n) => n.startsWith("custom")).length + 1}`
        : p.name;
    setName(unique);
    setDisplayName(p.displayName);
    setBaseUrl(p.baseUrl);
    setDefaultModel(p.defaultModel);
    setAvailableModels(p.suggestedModels);
    setDiscoveredModels([]);
    setModelFilter("");
  };

  const toggleModel = (m: string) => {
    setAvailableModels((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  };

  const addCustomModel = () => {
    const m = customModel.trim();
    if (!m) return;
    if (!availableModels.includes(m)) {
      setAvailableModels([...availableModels, m]);
    }
    if (!defaultModel) setDefaultModel(m);
    setCustomModel("");
  };

  const discover = async () => {
    if (!baseUrl.trim()) {
      toast.error("Set a Base URL first");
      return;
    }
    setDiscovering(true);
    try {
      const res = await fetch("/api/admin/ai/discover-models", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey: testApiKey || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error ?? `${res.status} ${res.statusText}`);
      }
      const models: string[] = json.data?.models ?? [];
      if (models.length === 0) {
        toast.warning("Endpoint reachable but returned zero models");
      } else {
        toast.success(`Discovered ${models.length} models`);
      }
      setDiscoveredModels(models);
      // Auto-add discovered models to available
      setAvailableModels((prev) => {
        const set = new Set([...prev, ...models]);
        return Array.from(set);
      });
      if (!defaultModel && models.length > 0) {
        setDefaultModel(models[0]);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDiscovering(false);
    }
  };

  const activePreset = presets.find((p) => p.name === presetName);
  const allModelCandidates = useMemo(() => {
    const union = new Set<string>();
    activePreset?.suggestedModels.forEach((m) => union.add(m));
    discoveredModels.forEach((m) => union.add(m));
    availableModels.forEach((m) => union.add(m));
    if (defaultModel) union.add(defaultModel);
    return Array.from(union).sort((a, b) => a.localeCompare(b));
  }, [activePreset, discoveredModels, availableModels, defaultModel]);

  const filteredModels = useMemo(() => {
    const q = modelFilter.trim().toLowerCase();
    if (!q) return allModelCandidates;
    return allModelCandidates.filter((m) => m.toLowerCase().includes(q));
  }, [allModelCandidates, modelFilter]);

  const canSubmit =
    name && displayName && baseUrl && defaultModel && availableModels.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add AI provider</DialogTitle>
          <DialogDescription>
            Pick a cloud service or a self-hosted endpoint. All providers must
            expose an OpenAI-compatible <code>POST /v1/chat/completions</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Preset picker — split cloud vs local */}
          <div className="space-y-3">
            {cloudPresets.length > 0 && (
              <div>
                <Label className="text-xs flex items-center gap-1.5 mb-2">
                  <Cloud className="h-3.5 w-3.5" />
                  Cloud providers
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {cloudPresets.map((p) => (
                    <PresetButton
                      key={p.name}
                      preset={p}
                      active={presetName === p.name}
                      onClick={() => applyPreset(p.name)}
                    />
                  ))}
                </div>
              </div>
            )}
            {localPresets.length > 0 && (
              <div>
                <Label className="text-xs flex items-center gap-1.5 mb-2">
                  <HardDrive className="h-3.5 w-3.5" />
                  Self-hosted (local)
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {localPresets.map((p) => (
                    <PresetButton
                      key={p.name}
                      preset={p}
                      active={presetName === p.name}
                      onClick={() => applyPreset(p.name)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {presetName && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Slug</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value.toLowerCase())}
                    placeholder="openai"
                  />
                </div>
                <div>
                  <Label className="text-xs">Display name</Label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="OpenAI"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Base URL</Label>
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Must expose <code>POST /chat/completions</code> at this base URL.
                </p>
              </div>

              {/* Live discovery */}
              <div className="border rounded-md p-3 space-y-2.5 bg-muted/30">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label className="text-xs font-medium">
                      Discover models live
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Hits <code>{baseUrl || "<baseUrl>"}/models</code> and returns
                      everything the provider exposes. Works for OpenAI, Groq,
                      Ollama, vLLM, and most others.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={discover}
                    disabled={discovering || !baseUrl.trim()}
                  >
                    {discovering ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Discover
                  </Button>
                </div>
                <div>
                  <Input
                    type="password"
                    value={testApiKey}
                    onChange={(e) => setTestApiKey(e.target.value)}
                    placeholder={
                      LOCAL_PRESETS.has(presetName)
                        ? "API key (optional for local)"
                        : "API key (required for cloud discovery)"
                    }
                    className="h-8 text-xs"
                    autoComplete="off"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Used only for this discovery call — not stored. Add permanent
                    keys after the provider is created.
                  </p>
                </div>
              </div>

              {/* Model checklist */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium">
                    Select models ({availableModels.length} selected)
                  </Label>
                  {allModelCandidates.length > 0 && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className="text-[10px] text-primary hover:underline"
                        onClick={() => setAvailableModels(allModelCandidates)}
                      >
                        Select all
                      </button>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <button
                        type="button"
                        className="text-[10px] text-primary hover:underline"
                        onClick={() => setAvailableModels([])}
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                {allModelCandidates.length > 0 && (
                  <Input
                    value={modelFilter}
                    onChange={(e) => setModelFilter(e.target.value)}
                    placeholder="Filter models…"
                    className="h-8 text-xs mb-2"
                  />
                )}

                <div className="border rounded-md max-h-48 overflow-y-auto">
                  {filteredModels.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground text-center">
                      No models yet — click Discover above or add one below.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {filteredModels.map((m) => {
                        const selected = availableModels.includes(m);
                        const fromDiscover = discoveredModels.includes(m);
                        const fromPreset = activePreset?.suggestedModels.includes(m);
                        return (
                          <li key={m}>
                            <button
                              type="button"
                              onClick={() => toggleModel(m)}
                              className={cn(
                                "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-muted/60",
                                selected && "bg-primary/5"
                              )}
                            >
                              <div
                                className={cn(
                                  "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                                  selected
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-input"
                                )}
                              >
                                {selected && <Check className="h-3 w-3" />}
                              </div>
                              <span className="font-mono flex-1 truncate">{m}</span>
                              {fromDiscover && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] h-4 border-emerald-300 text-emerald-700"
                                >
                                  live
                                </Badge>
                              )}
                              {fromPreset && !fromDiscover && (
                                <Badge variant="outline" className="text-[9px] h-4">
                                  preset
                                </Badge>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="flex gap-2 mt-2">
                  <Input
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="Add custom model id…"
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomModel();
                      }
                    }}
                  />
                  <Button size="sm" variant="outline" onClick={addCustomModel}>
                    Add
                  </Button>
                </div>
              </div>

              {/* Default model */}
              <div>
                <Label className="text-xs">Default model</Label>
                <Select
                  value={defaultModel}
                  onValueChange={setDefaultModel}
                  disabled={availableModels.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a default model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Used when <code>/api/chat</code> is called without a model override.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Set as default provider</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Used when no <code>providerId</code> is sent.
                  </p>
                </div>
                <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                name,
                displayName,
                baseUrl,
                defaultModel,
                availableModels,
                isDefault,
              })
            }
          >
            Add provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PresetButton({
  preset,
  active,
  onClick,
}: {
  preset: ProviderPresetDTO;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-md border p-2.5 transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "hover:border-primary/50 hover:bg-muted/50"
      )}
    >
      <div className="text-xs font-medium truncate">{preset.displayName}</div>
      <div className="text-[10px] text-muted-foreground truncate font-mono mt-0.5">
        {preset.baseUrl}
      </div>
    </button>
  );
}
