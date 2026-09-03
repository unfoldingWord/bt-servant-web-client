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

export type PdfAttachment = {
  type: "pdf";
  url: string;
  filename: string;
  size_bytes: number;
  mime_type: "application/pdf";
};

// Discriminated by `type`. Adding a new variant (e.g. AudioAttachment) here
// forces consumers that switch on `type` to handle it via exhaustiveness checks.
export type Attachment = PdfAttachment;

export interface ChatResponse {
  responses: string[];
  response_language: string;
  voice_audio_base64: string | null;
  voice_audio_url?: string;
  attachments?: Attachment[];
}

export interface UserPreferences {
  response_language?: string;
}

export interface ChatHistoryEntry {
  user_message: string;
  assistant_response: string;
  timestamp?: number;
  created_at?: string | null;
  voice_audio_url?: string | null;
  attachments?: Attachment[] | null;
}

export interface ChatHistoryResponse {
  user_id: string;
  entries: ChatHistoryEntry[];
  total_count: number;
  limit: number;
  offset: number;
}

/**
 * The worker's stable status ids (bt-servant-worker#407). The client reads
 * only the TTS members (`TTS_STATUS_KEYS`); anything else on the wire is
 * tolerated and falls back to the message heuristic in use-chat-runtime.ts.
 */
export const WORKER_STATUS_KEYS = [
  "status_queued",
  "status_processing",
  "status_preparing",
  "status_executing_tools",
  "status_transcribing",
  "status_tts_generating",
  "status_tts_still_generating",
] as const;

export type WorkerStatusKey = (typeof WORKER_STATUS_KEYS)[number];

export function isWorkerStatusKey(key: string): key is WorkerStatusKey {
  return (WORKER_STATUS_KEYS as readonly string[]).includes(key);
}

/** The statuses during which the worker is synthesizing speech. */
export const TTS_STATUS_KEYS: ReadonlySet<WorkerStatusKey> = new Set([
  "status_tts_generating",
  "status_tts_still_generating",
]);

// SSE event types for streaming endpoint (matching backend)
export type SSEEvent =
  // `key` is the worker's status id (a `WorkerStatusKey` on a current
  // worker; typed open because older workers send none and newer ones may
  // add more); `message` is already localized.
  | { type: "status"; message: string; key?: string }
  | { type: "progress"; text: string }
  | { type: "complete"; response: ChatResponse }
  | { type: "error"; error: string }
  | { type: "tool_use"; tool: string; input: unknown }
  | { type: "tool_result"; tool: string; result: unknown }
  | { type: "keepalive" };
