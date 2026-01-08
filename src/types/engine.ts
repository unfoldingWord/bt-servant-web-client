// Types matching bt-servant-engine API contracts

export type MessageType = "text" | "audio";

export interface ChatRequest {
  client_id: string;
  user_id: string;
  message: string;
  message_type: MessageType;
  audio_base64?: string;
  audio_format?: string; // "webm", "ogg", "mp3"
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
