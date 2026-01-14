import type {
  ChatRequest,
  ChatResponse,
  ChatHistoryResponse,
  MessageType,
  UserPreferences,
} from "@/types/engine";

const ENGINE_BASE_URL = process.env.ENGINE_BASE_URL!;
const ENGINE_API_KEY = process.env.ENGINE_API_KEY!;
const CLIENT_ID = process.env.CLIENT_ID || "web";
const DEFAULT_TIMEOUT = 120000; // 2 minutes for AI processing

function getAuthHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${ENGINE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function sendChatMessage(
  userId: string,
  message: string,
  messageType: MessageType = "text",
  audioBase64?: string,
  audioFormat?: string,
  progressCallbackUrl?: string,
  progressThrottleSeconds?: number
): Promise<ChatResponse> {
  const payload: ChatRequest = {
    client_id: CLIENT_ID,
    user_id: userId,
    message,
    message_type: messageType,
    ...(audioBase64 && { audio_base64: audioBase64 }),
    ...(audioFormat && { audio_format: audioFormat }),
    ...(progressCallbackUrl && { progress_callback_url: progressCallbackUrl }),
    ...(progressThrottleSeconds && {
      progress_throttle_seconds: progressThrottleSeconds,
    }),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const response = await fetch(`${ENGINE_BASE_URL}/api/v1/chat`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Engine API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getUserPreferences(
  userId: string
): Promise<UserPreferences> {
  const response = await fetch(
    `${ENGINE_BASE_URL}/api/v1/users/${userId}/preferences`,
    { headers: getAuthHeaders() }
  );

  if (response.status === 404) {
    return {}; // Return defaults for new users
  }

  if (!response.ok) {
    throw new Error(`Engine API error: ${response.status}`);
  }

  return response.json();
}

export async function updateUserPreferences(
  userId: string,
  preferences: Partial<UserPreferences>
): Promise<UserPreferences> {
  const response = await fetch(
    `${ENGINE_BASE_URL}/api/v1/users/${userId}/preferences`,
    {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(preferences),
    }
  );

  if (!response.ok) {
    throw new Error(`Engine API error: ${response.status}`);
  }

  return response.json();
}

export async function getChatHistory(
  userId: string,
  limit = 50,
  offset = 0
): Promise<ChatHistoryResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const response = await fetch(
    `${ENGINE_BASE_URL}/api/v1/users/${userId}/history?${params}`,
    { headers: getAuthHeaders() }
  );

  if (response.status === 404) {
    return { user_id: userId, entries: [], total_count: 0, limit, offset };
  }

  if (!response.ok) {
    throw new Error(`Engine API error: ${response.status}`);
  }

  return response.json();
}
