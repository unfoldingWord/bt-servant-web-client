// Types matching bt-servant-worker API contracts

export type MessageType = "text" | "audio";

export interface ChatRequest {
  client_id: string;
  user_id: string;
  message: string;
  message_type: MessageType;
  audio_base64?: string;
  audio_format?: string; // "webm", "ogg", "mp3"
  org?: string; // Organization for MCP server selection (defaults to DEFAULT_ORG)
}

export interface ChatResponse {
  responses: string[];
  response_language: string;
  voice_audio_base64: string | null;
}

export interface UserPreferences {
  response_language?: string;
}

export interface ChatHistoryEntry {
  user_message: string;
  assistant_response: string;
  timestamp?: number;
  created_at?: string | null;
}

export interface ChatHistoryResponse {
  user_id: string;
  entries: ChatHistoryEntry[];
  total_count: number;
  limit: number;
  offset: number;
}

// SSE event types for streaming endpoint (matching backend)
export type SSEEvent =
  | { type: "status"; message: string }
  | { type: "progress"; text: string }
  | { type: "complete"; response: ChatResponse }
  | { type: "error"; error: string }
  | { type: "tool_use"; tool: string; input: unknown }
  | { type: "tool_result"; tool: string; result: unknown };
