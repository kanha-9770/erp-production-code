export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  providerId?: string;
}

export interface ResolvedProvider {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  defaultModel: string;
  availableModels: string[];
  temperature: number | null;
  maxTokens: number | null;
}

export interface ResolvedKey {
  id: string;
  label: string;
  plaintext: string;
  keyPreview: string;
}

export class LLMClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly providerName?: string
  ) {
    super(message);
    this.name = "LLMClientError";
  }
}
