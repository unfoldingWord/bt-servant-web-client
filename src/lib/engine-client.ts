import type { ChatHistoryResponse, UserPreferences } from "@/types/engine";

const ENGINE_BASE_URL = process.env.ENGINE_BASE_URL!;
const ENGINE_API_KEY = process.env.ENGINE_API_KEY!;
const DEFAULT_ORG = process.env.DEFAULT_ORG || "unfoldingWord";

function getAuthHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${ENGINE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function getUserPreferences(
  userId: string
): Promise<UserPreferences> {
  const response = await fetch(
    `${ENGINE_BASE_URL}/api/v1/orgs/${DEFAULT_ORG}/users/${userId}/preferences`,
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
    `${ENGINE_BASE_URL}/api/v1/orgs/${DEFAULT_ORG}/users/${userId}/preferences`,
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
    `${ENGINE_BASE_URL}/api/v1/orgs/${DEFAULT_ORG}/users/${userId}/history?${params}`,
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
