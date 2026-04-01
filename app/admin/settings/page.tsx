'use client';

import { useState, useEffect, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Settings,
  Plus,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Zap,
  Bot,
  Key,
  Shield,
  Cpu,
  Thermometer,
  Hash,
  ToggleLeft,
  RefreshCw,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { AI_PROVIDERS } from '@/lib/ai-providers';
import { getAIConfigurations, createAIConfiguration, updateAIConfiguration, deleteAIConfiguration, testAIConfiguration } from '@/app/actions/ai-config';
import { AIConfigFormData } from '@/lib/ai-config-helpers';

type ConfigItem = {
  id: string;
  provider: string;
  model: string;
  apiKey: string;
  apiKeyMasked: string;
  temperature: number;
  maxTokens: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Provider icon color mapping
function getProviderColor(provider: string) {
  const colorMap: Record<string, string> = {
    openai: 'text-emerald-600',
    anthropic: 'text-amber-600',
    google: 'text-blue-500',
    xai: 'text-foreground',
    groq: 'text-orange-500',
    deepinfra: 'text-purple-500',
  };
  return colorMap[provider] || 'text-muted-foreground';
}

function getProviderLabel(value: string) {
  return AI_PROVIDERS.find(p => p.value === value)?.label || value;
}

function getProviderModels(provider: string) {
  return AI_PROVIDERS.find(p => p.value === provider)?.models || [];
}

// Config form component
function ConfigForm({
  initialData,
  onSubmit,
  onCancel,
  isNew,
}: {
  initialData?: Partial<ConfigItem>;
  onSubmit: (data: AIConfigFormData) => Promise<void>;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [provider, setProvider] = useState(initialData?.provider || 'openai');
  const [model, setModel] = useState(initialData?.model || 'gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [temperature, setTemperature] = useState(initialData?.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(initialData?.maxTokens ?? 2048);
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const models = getProviderModels(provider);

  // When provider changes, select first model
  useEffect(() => {
    const availableModels = getProviderModels(provider);
    if (availableModels.length > 0 && !availableModels.includes(model as any)) {
      setModel(availableModels[0]);
    }
  }, [provider, model]);

  const handleSubmit = async () => {
    if (isNew && !apiKey.trim()) {
      toast.error('API key is required');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        provider,
        model,
        apiKey: apiKey || initialData?.apiKey || '',
        temperature,
        maxTokens,
        isActive,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Provider */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
          AI Provider
        </Label>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_PROVIDERS.map(p => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Model */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
          Model
        </Label>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map(m => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          The chatbot will use <span className="font-mono text-foreground/80">{provider}/{model}</span> via Vercel AI Gateway
        </p>
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Key className="h-3.5 w-3.5 text-muted-foreground" />
          API Key
          {!isNew && (
            <span className="text-xs text-muted-foreground font-normal">(leave empty to keep existing)</span>
          )}
        </Label>
        <div className="relative">
          <Input
            type={showApiKey ? 'text' : 'password'}
            placeholder={isNew ? 'Enter your API key...' : `Current: ${initialData?.apiKeyMasked || '***'}`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="pr-10 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Shield className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            Your API key is stored encrypted in the database and is only used server-side. It is never sent to the browser.
          </p>
        </div>
      </div>

      {/* Temperature + Max Tokens */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
            Temperature
          </Label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-foreground"
            />
            <span className="font-mono text-sm w-8 text-right">{temperature.toFixed(1)}</span>
          </div>
          <p className="text-xs text-muted-foreground">0 = precise, 2 = creative</p>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            Max Tokens
          </Label>
          <Input
            type="number"
            min={256}
            max={128000}
            step={256}
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2048)}
          />
          <p className="text-xs text-muted-foreground">Max output length</p>
        </div>
      </div>

      {/* Active toggle */}
      <div
        className="flex items-center justify-between p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setIsActive(!isActive)}
      >
        <div className="flex items-center gap-2">
          <ToggleLeft className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Active Configuration</p>
            <p className="text-xs text-muted-foreground">Enable this as the active AI configuration</p>
          </div>
        </div>
        <div className={`w-10 h-6 rounded-full flex items-center transition-colors ${isActive ? 'bg-foreground' : 'bg-muted-foreground/30'}`}>
          <div className={`w-4 h-4 rounded-full bg-background transition-transform mx-1 ${isActive ? 'translate-x-4' : ''}`} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSubmit} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isNew ? 'Create Configuration' : 'Save Changes'}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// Config card component
function ConfigCard({
  config,
  onEdit,
  onDelete,
  onTest,
  testingId,
}: {
  config: ConfigItem;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  testingId: string | null;
}) {
  return (
    <Card className={`border transition-all ${config.isActive ? 'border-foreground/20 shadow-md' : 'border-border'}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`flex items-center justify-center w-10 h-10 rounded-lg bg-muted ${getProviderColor(config.provider)}`}>
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">{getProviderLabel(config.provider)}</h3>
                {config.isActive && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                {config.provider}/{config.model}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onTest} disabled={testingId === config.id}>
              {testingId === config.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
            <Key className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-mono">{config.apiKeyMasked}</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
            <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs">Temp: {config.temperature}</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs">{config.maxTokens.toLocaleString()} tokens</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Main page
export default function AISettingsPage() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAIConfigurations();
      setConfigs(data as ConfigItem[]);
    } catch {
      toast.error('Failed to load configurations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const handleCreate = async (data: AIConfigFormData) => {
    const result = await createAIConfiguration(data);
    if ('error' in result) {
      toast.error(result.error);
    } else {
      toast.success('AI configuration created');
      setShowForm(false);
      loadConfigs();
    }
  };

  const handleUpdate = async (data: AIConfigFormData) => {
    if (!editingId) return;
    const result = await updateAIConfiguration(editingId, data);
    if ('error' in result) {
      toast.error(result.error);
    } else {
      toast.success('AI configuration updated');
      setEditingId(null);
      loadConfigs();
    }
  };

  const handleDelete = async (id: string) => {
    const result = await deleteAIConfiguration(id);
    if ('error' in result) {
      toast.error(result.error);
    } else {
      toast.success('Configuration deleted');
      loadConfigs();
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await testAIConfiguration(id);
      if ('error' in result) {
        toast.error(result.error);
      } else {
        toast.success(result.message);
      }
    } catch {
      toast.error('Test failed unexpectedly');
    } finally {
      setTestingId(null);
    }
  };

  const editingConfig = editingId ? configs.find(c => c.id === editingId) : null;
  const activeConfig = configs.find(c => c.isActive);

  return (
    <div className="space-y-6 py-4 px-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-foreground/5">
            <Settings className="h-5 w-5 text-foreground/70" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground text-balance">AI Configuration</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure API keys and models for the ERP chatbot
            </p>
          </div>
        </div>
        {!showForm && !editingId && (
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Provider
          </Button>
        )}
      </div>

      <Tabs defaultValue="providers" className="w-full">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="howto">Setup Guide</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-6 mt-4">
          {/* Active config banner */}
          {activeConfig && !showForm && !editingId && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Chatbot is using{' '}
                  <span className="font-mono">{activeConfig.provider}/{activeConfig.model}</span>
                </p>
                <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">
                  Temperature: {activeConfig.temperature} | Max tokens: {activeConfig.maxTokens.toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* No config warning */}
          {!loading && configs.length === 0 && !showForm && (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 mb-4">
                  <AlertCircle className="h-7 w-7 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold mb-1">No AI Configuration</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md mb-6 text-pretty leading-relaxed">
                  The chatbot needs an AI provider API key to work. Add your first provider configuration to enable the ERP Intelligence Chatbot.
                </p>
                <Button onClick={() => setShowForm(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Your First Provider
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Form */}
          {(showForm || editingId) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {editingId ? 'Edit Configuration' : 'New AI Provider'}
                </CardTitle>
                <CardDescription>
                  {editingId ? 'Modify your AI provider settings' : 'Configure a new AI provider with your API key'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ConfigForm
                  initialData={editingConfig || undefined}
                  onSubmit={editingId ? handleUpdate : handleCreate}
                  onCancel={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  isNew={!editingId}
                />
              </CardContent>
            </Card>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Config list */}
          {!loading && !showForm && !editingId && (
            <div className="space-y-3">
              {configs.map(config => (
                <ConfigCard
                  key={config.id}
                  config={config}
                  onEdit={() => setEditingId(config.id)}
                  onDelete={() => handleDelete(config.id)}
                  onTest={() => handleTest(config.id)}
                  testingId={testingId}
                />
              ))}
            </div>
          )}

          {/* Refresh */}
          {!loading && configs.length > 0 && !showForm && !editingId && (
            <div className="flex justify-center pt-2">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={loadConfigs}>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="howto" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">How to Set Up AI for Your Organization</CardTitle>
              <CardDescription>Step-by-step guide to configuring the ERP chatbot</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Steps */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background text-xs font-bold flex-shrink-0">1</div>
                  <div>
                    <h4 className="font-medium text-sm">Get an API Key</h4>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      Sign up for an account with one of the supported AI providers and generate an API key from their dashboard.
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {AI_PROVIDERS.map(p => (
                        <div key={p.value} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm">
                          <Bot className={`h-4 w-4 ${getProviderColor(p.value)}`} />
                          <span className="font-medium">{p.label}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{p.models.length} models</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background text-xs font-bold flex-shrink-0">2</div>
                  <div>
                    <h4 className="font-medium text-sm">Add Configuration</h4>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      Click "Add Provider" above, select your provider, choose a model, paste your API key, and save. The configuration is encrypted and stored securely.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background text-xs font-bold flex-shrink-0">3</div>
                  <div>
                    <h4 className="font-medium text-sm">Test the Connection</h4>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      Click the lightning bolt icon on your configuration card to test the connection. This sends a small test message to verify your API key and model are working.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background text-xs font-bold flex-shrink-0">4</div>
                  <div>
                    <h4 className="font-medium text-sm">Start Using the Chatbot</h4>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      Navigate to the Chatbot page and start asking questions about your organization data. The chatbot will use the active provider configuration.
                    </p>
                  </div>
                </div>
              </div>

              {/* Info box */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/50 border border-border">
                <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Important Notes</p>
                  <ul className="text-sm text-muted-foreground space-y-1 leading-relaxed">
                    <li>- Only one provider can be active at a time per organization.</li>
                    <li>- API keys are stored server-side and never exposed to the browser.</li>
                    <li>- Only organization admins and owners can manage configurations.</li>
                    <li>- The chatbot respects role-based access -- data visibility depends on the user{"'"}s permissions.</li>
                    <li>- If no configuration exists, the chatbot uses the default AI Gateway.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
