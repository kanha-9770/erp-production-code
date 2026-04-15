/**
 * Preset configurations for OpenAI-compatible cloud providers.
 * Every preset here exposes POST /v1/chat/completions and can be driven by
 * the `openai` SDK with a custom baseURL.
 */

export interface ProviderPreset {
  name: string;
  displayName: string;
  baseUrl: string;
  defaultModel: string;
  suggestedModels: string[];
  docsUrl: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    name: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    suggestedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o3-mini"],
    docsUrl: "https://platform.openai.com/docs/models",
  },
  {
    name: "groq",
    displayName: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    suggestedModels: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
    ],
    docsUrl: "https://console.groq.com/docs/models",
  },
  {
    name: "openrouter",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    suggestedModels: [
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
      "meta-llama/llama-3.3-70b-instruct",
      "google/gemini-2.0-flash-exp:free",
    ],
    docsUrl: "https://openrouter.ai/models",
  },
  {
    name: "anthropic",
    displayName: "Anthropic (OpenAI-compatible)",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-5",
    suggestedModels: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
    docsUrl: "https://docs.anthropic.com/en/api/openai-sdk",
  },
  {
    name: "gemini",
    displayName: "Google Gemini (OpenAI-compatible)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    suggestedModels: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    docsUrl: "https://ai.google.dev/gemini-api/docs/openai",
  },
  {
    name: "together",
    displayName: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    suggestedModels: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "mistralai/Mixtral-8x7B-Instruct-v0.1",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
    ],
    docsUrl: "https://docs.together.ai/docs/inference-models",
  },
  {
    name: "deepinfra",
    displayName: "DeepInfra",
    baseUrl: "https://api.deepinfra.com/v1/openai",
    defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    suggestedModels: [
      "meta-llama/Meta-Llama-3.1-70B-Instruct",
      "mistralai/Mixtral-8x7B-Instruct-v0.1",
    ],
    docsUrl: "https://deepinfra.com/models",
  },
  {
    name: "xai",
    displayName: "xAI Grok",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-2-latest",
    suggestedModels: ["grok-2-latest", "grok-2-mini"],
    docsUrl: "https://docs.x.ai/api",
  },
  {
    name: "ollama",
    displayName: "Ollama (self-hosted)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    suggestedModels: [
      "llama3.2",
      "llama3.1",
      "llama3.1:70b",
      "qwen2.5",
      "qwen2.5:32b",
      "mistral",
      "mixtral",
      "phi3",
      "gemma2",
      "deepseek-r1",
      "codellama",
    ],
    docsUrl: "https://github.com/ollama/ollama/blob/main/docs/openai.md",
  },
  {
    name: "vllm",
    displayName: "vLLM (self-hosted)",
    baseUrl: "http://localhost:8000/v1",
    defaultModel: "meta-llama/Meta-Llama-3.1-8B-Instruct",
    suggestedModels: [
      "meta-llama/Meta-Llama-3.1-8B-Instruct",
      "meta-llama/Meta-Llama-3.1-70B-Instruct",
      "Qwen/Qwen2.5-7B-Instruct",
      "Qwen/Qwen2.5-32B-Instruct",
      "mistralai/Mistral-7B-Instruct-v0.3",
    ],
    docsUrl: "https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html",
  },
  {
    name: "llamacpp",
    displayName: "llama.cpp server",
    baseUrl: "http://localhost:8080/v1",
    defaultModel: "gpt-3.5-turbo",
    suggestedModels: ["gpt-3.5-turbo"],
    docsUrl: "https://github.com/ggerganov/llama.cpp/tree/master/examples/server",
  },
  {
    name: "lmstudio",
    displayName: "LM Studio (self-hosted)",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "local-model",
    suggestedModels: ["local-model"],
    docsUrl: "https://lmstudio.ai/docs/local-server",
  },
  {
    name: "custom",
    displayName: "Custom (OpenAI-compatible)",
    baseUrl: "https://your-endpoint.example.com/v1",
    defaultModel: "your-model",
    suggestedModels: [],
    docsUrl: "",
  },
];

export function getPreset(name: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.name === name);
}
