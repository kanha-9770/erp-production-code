export interface AIProviderKeyDTO {
  id: string;
  label: string;
  keyPreview: string;
  isActive: boolean;
  lastUsedAt: string | null;
  failureCount: number;
  cooldownUntil: string | null;
  createdAt: string;
}

export interface AIProviderDTO {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  defaultModel: string;
  availableModels: string[];
  isActive: boolean;
  isDefault: boolean;
  priority: number;
  temperature: number | null;
  maxTokens: number | null;
  createdAt: string;
  updatedAt: string;
  apiKeys: AIProviderKeyDTO[];
}

export interface ProviderPresetDTO {
  name: string;
  displayName: string;
  baseUrl: string;
  defaultModel: string;
  suggestedModels: string[];
  docsUrl: string;
}
