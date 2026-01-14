"use client";

import {
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useState, useCallback, useRef } from "react";
import type { ChatResponse, ChatHistoryResponse } from "@/types/engine";
import type { SSEEvent } from "@/lib/progress-store";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: Array<{ type: "text"; text: string }>;
  createdAt: Date;
  audioBase64?: string;
}

function toThreadMessage(message: ChatMessage): ThreadMessageLike {
  const base = {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    metadata: {
      custom: {
        audioBase64: message.audioBase64,
      },
    },
  };

  // Status is only valid for assistant messages
  if (message.role === "assistant") {
    return {
      ...base,
      status: { type: "complete" as const, reason: "stop" as const },
    };
  }

  return base;
}

function createMessage(
  id: string,
  role: "user" | "assistant",
  content: string,
  audioBase64?: string
): ChatMessage {
  return {
    id,
    role,
    content: [{ type: "text" as const, text: content }],
    createdAt: new Date(),
    audioBase64,
  };
}

export function useChatRuntime() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const historyLoadedRef = useRef(false);

  // Load chat history and convert to ChatMessage format
  const loadHistory = useCallback(async (): Promise<ChatMessage[]> => {
    try {
      const response = await fetch("/api/chat/history");
      if (!response.ok) {
        return [];
      }

      const history: ChatHistoryResponse = await response.json();

      // Convert history entries to ChatMessage format
      // History is newest-first, so reverse for chronological order
      const historyMessages: ChatMessage[] = [];
      const reversedEntries = [...history.entries].reverse();

      reversedEntries.forEach((entry, i) => {
        // Add user message
        historyMessages.push({
          id: `history-user-${i}`,
          role: "user",
          content: [{ type: "text" as const, text: entry.user_message }],
          createdAt: entry.created_at ? new Date(entry.created_at) : new Date(),
        });

        // Add assistant message
        historyMessages.push({
          id: `history-assistant-${i}`,
          role: "assistant",
          content: [{ type: "text" as const, text: entry.assistant_response }],
          createdAt: entry.created_at ? new Date(entry.created_at) : new Date(),
        });
      });

      return historyMessages;
    } catch {
      return [];
    }
  }, []);

  // Define handlers before sendMessage so they can be in the dependency array
  const handleComplete = useCallback((data: ChatResponse) => {
    // Add assistant response(s)
    const assistantMessages: ChatMessage[] = data.responses.map(
      (responseText, i) =>
        createMessage(
          `assistant-${Date.now()}-${i}`,
          "assistant",
          responseText,
          i === 0 ? data.voice_audio_base64 || undefined : undefined
        )
    );

    setMessages((prev) => [...prev, ...assistantMessages]);
    setIsLoading(false);
    setProgressStatus(null);
  }, []);

  const handleError = useCallback((errorMessage: string) => {
    setMessages((prev) => [
      ...prev,
      createMessage(`error-${Date.now()}`, "assistant", errorMessage),
    ]);
    setIsLoading(false);
    setProgressStatus(null);
  }, []);

  const sendMessage = useCallback(
    async (text: string, audioBase64?: string, audioFormat?: string) => {
      // Load history on first message if not already loaded
      if (!historyLoadedRef.current) {
        historyLoadedRef.current = true;
        const historyMessages = await loadHistory();
        if (historyMessages.length > 0) {
          setMessages(historyMessages);
        }
      }

      // Add user message
      const userMessage = createMessage(
        `user-${Date.now()}`,
        "user",
        text || "[Voice message]"
      );

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setProgressStatus(null);

      try {
        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            message_type: audioBase64 ? "audio" : "text",
            audio_base64: audioBase64,
            audio_format: audioFormat,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

        // Read SSE stream
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event: SSEEvent = JSON.parse(line.slice(6));

                if (event.type === "progress") {
                  setProgressStatus(event.text);
                } else if (event.type === "complete") {
                  handleComplete(event.response);
                } else if (event.type === "error") {
                  handleError(event.error);
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (error) {
        console.error("Chat error:", error);
        handleError("Sorry, I encountered an error. Please try again.");
      }
    },
    [handleComplete, handleError, loadHistory]
  );

  // Create assistant-ui runtime
  const runtime = useExternalStoreRuntime({
    messages: messages.map(toThreadMessage),
    isRunning: isLoading,
    convertMessage: (message) => message,
    onNew: async (message) => {
      if (message.content[0]?.type === "text") {
        await sendMessage(message.content[0].text);
      }
    },
  });

  return {
    runtime,
    messages,
    isLoading,
    progressStatus,
    sendMessage,
    clearMessages: () => setMessages([]),
  };
}
