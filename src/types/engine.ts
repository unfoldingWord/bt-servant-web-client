// Types matching bt-servant-engine API contracts

export type MessageType = "text" | "audio";

export interface ChatRequest {
  client_id: string;
  user_id: string;
  message: string;
  message_type: MessageType;
  audio_base64?: string;
  audio_format?: string; // "webm", "ogg", "mp3"
  progress_callback_url?: string;
  progress_throttle_seconds?: number;
}

// Progress callback payload from engine webhook
export interface ProgressCallback {
  user_id: string;
  message_key: string;
  text: string;
  timestamp: number;
}

export interface ChatResponse {
  responses: string[];
  response_language: string;
  voice_audio_base64: string | null;
  intent_processed: string;
  has_queued_intents: boolean;
}

export interface UserPreferences {
  response_language?: string;
  agentic_strength?: "normal" | "low" | "very_low";
  dev_agentic_mcp?: boolean;
}

export interface ChatHistoryEntry {
  user_message: string;
  assistant_response: string;
  created_at: string | null;
}

export interface ChatHistoryResponse {
  user_id: string;
  entries: ChatHistoryEntry[];
  total_count: number;
  limit: number;
  offset: number;
}
