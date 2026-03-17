// app/lib/ai-config-helpers.ts

import type { AIConfiguration } from '@prisma/client'; // adjust import if needed

export const AI_PROVIDERS = [
  { value: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'] },
  { value: 'anthropic', label: 'Anthropic', models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'] },
  { value: 'google', label: 'Google', models: ['gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'] },
  { value: 'xai', label: 'xAI (Grok)', models: ['grok-3', 'grok-3-mini', 'grok-2'] },
  { value: 'groq', label: 'Groq', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
  { value: 'deepinfra', label: 'Deep Infra', models: ['meta-llama/Llama-3.3-70B-Instruct', 'mistralai/Mixtral-8x22B-Instruct-v0.1'] },
] as const;

export type AIConfigFormData = {
  provider: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  isActive: boolean;
};

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
}