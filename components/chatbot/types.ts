export interface ProviderDTO {
  id: string;
  name: string;
  displayName: string;
  defaultModel: string;
  availableModels: string[];
  isDefault: boolean;
  isLocal?: boolean;
}

export interface ConversationSummary {
  id: string;
  title: string;
  providerId: string | null;
  model: string | null;
  isPinned: boolean;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  providerName: string | null;
  model: string | null;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  systemPrompt: string | null;
  temperature: number | null;
  messages: ConversationMessage[];
}

export interface ToolEvent {
  name: string;
  status: "calling" | "done";
  timestamp: number;
}

export type AttachmentKind =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "spreadsheet"
  | "code"
  | "archive"
  | "file";

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string; // public URL under /uploads/chat/...
  kind: AttachmentKind;
}

export interface LocalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: boolean;
  providerName?: string;
  model?: string;
  toolEvents?: ToolEvent[];
  attachments?: ChatAttachment[];
}
