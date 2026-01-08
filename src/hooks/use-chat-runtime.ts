"use client";

import {
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useState, useCallback } from "react";
import type { ChatResponse } from "@/types/engine";

interface ChatMessage extends ThreadMessageLike {
  audioBase64?: string; // For voice responses
}

// Convert internal message to assistant-ui ThreadMessageLike format
function toThreadMessage(message: ChatMessage): ThreadMessageLike {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    status: message.status,
  };
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
    status: { type: "complete" as const, reason: "stop" as const },
    audioBase64,
  };
}

export function useChatRuntime() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastAudioResponse, setLastAudioResponse] = useState<string | null>(
    null
  );

  const sendMessage = useCallback(
    async (text: string, audioBase64?: string, audioFormat?: string) => {
      // Add user message
      const userMessage = createMessage(
        `user-${Date.now()}`,
        "user",
        text || "[Voice message]"
      );

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setLastAudioResponse(null);

      try {
        const response = await fetch("/api/chat", {
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

        const data: ChatResponse = await response.json();

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

        // Store audio for playback
        if (data.voice_audio_base64) {
          setLastAudioResponse(data.voice_audio_base64);
        }
      } catch (error) {
        console.error("Chat error:", error);
        // Add error message
        setMessages((prev) => [
          ...prev,
          createMessage(
            `error-${Date.now()}`,
            "assistant",
            "Sorry, I encountered an error. Please try again."
          ),
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    []
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
    sendMessage,
    lastAudioResponse,
    clearMessages: () => setMessages([]),
  };
}
