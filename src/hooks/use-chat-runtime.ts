"use client";

import {
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import type {
  ChatResponse,
  ChatHistoryResponse,
  SSEEvent,
} from "@/types/engine";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: Array<{ type: "text"; text: string }>;
  createdAt: Date;
  audioBase64?: string;
  isStreaming?: boolean;
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
        isStreaming: message.isStreaming,
      },
    },
  };

  // Status is only valid for assistant messages
  if (message.role === "assistant") {
    return {
      ...base,
      status: message.isStreaming
        ? { type: "running" as const }
        : { type: "complete" as const, reason: "stop" as const },
    };
  }

  return base;
}

function createMessage(
  id: string,
  role: "user" | "assistant",
  content: string,
  audioBase64?: string,
  isStreaming?: boolean
): ChatMessage {
  return {
    id,
    role,
    content: [{ type: "text" as const, text: content }],
    createdAt: new Date(),
    audioBase64,
    isStreaming,
  };
}

export function useChatRuntime() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string>("");
  const historyLoadedRef = useRef(false);
  const pendingCompleteRef = useRef<{ message: ChatMessage } | null>(null);
  const streamingTextRef = useRef(streamingText);
  useEffect(() => {
    streamingTextRef.current = streamingText;
  }, [streamingText]);

  // Load chat history and convert to ChatMessage format
  const loadHistory = useCallback(async (): Promise<ChatMessage[]> => {
    try {
      const response = await fetch("/api/chat/history");
      if (!response.ok) {
        return [];
      }

      const history: ChatHistoryResponse = await response.json();

      // Convert history entries to ChatMessage format
      const historyMessages: ChatMessage[] = [];

      history.entries.forEach((entry, i) => {
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

  // Load history on mount
  useEffect(() => {
    if (!historyLoadedRef.current) {
      historyLoadedRef.current = true;
      loadHistory().then((historyMessages) => {
        if (historyMessages.length > 0) {
          setMessages(historyMessages);
        }
      });
    }
  }, [loadHistory]);

  // Finalize a pending completion — called by AnimatedText when animation catches up
  const finalizeComplete = useCallback(() => {
    const pending = pendingCompleteRef.current;
    if (!pending) return;

    pendingCompleteRef.current = null;
    setMessages((prev) => [...prev, pending.message]);
    setIsLoading(false);
    setStatusMessage(null);
    setStreamingText("");
  }, []);

  // Safety valve: if animation callback never fires (e.g. component unmount),
  // force-finalize after a short delay to prevent stuck state
  useEffect(() => {
    if (!pendingCompleteRef.current) return;

    const timeout = setTimeout(() => {
      if (pendingCompleteRef.current) {
        finalizeComplete();
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [streamingText, finalizeComplete]);

  // Define handlers before sendMessage so they can be in the dependency array
  const handleComplete = useCallback((data: ChatResponse) => {
    const joinedResponse = data.responses.join("\n\n");
    const assistantMessage = createMessage(
      `assistant-${Date.now()}`,
      "assistant",
      joinedResponse,
      data.voice_audio_base64 || undefined
    );

    const currentStreaming = streamingTextRef.current;

    // If no streaming text was accumulated, or complete text diverges from
    // what was streamed, swap immediately (no animation to wait for)
    if (!currentStreaming || !joinedResponse.startsWith(currentStreaming)) {
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
      setStatusMessage(null);
      setStreamingText("");
      return;
    }

    // Defer swap: store pending data and set full text so animation finishes
    pendingCompleteRef.current = { message: assistantMessage };
    setStreamingText(joinedResponse);
    setStatusMessage(null);
  }, []);

  const handleError = useCallback((errorMessage: string) => {
    pendingCompleteRef.current = null;
    setMessages((prev) => [
      ...prev,
      createMessage(`error-${Date.now()}`, "assistant", errorMessage),
    ]);
    setIsLoading(false);
    setStatusMessage(null);
    setStreamingText("");
  }, []);

  const sendMessage = useCallback(
    async (text: string, audioBase64?: string, audioFormat?: string) => {
      // Force-finalize any pending completion so the message is preserved
      if (pendingCompleteRef.current) {
        const pending = pendingCompleteRef.current;
        pendingCompleteRef.current = null;
        setMessages((prev) => [...prev, pending.message]);
      }

      // Add user message
      const userMessage = createMessage(
        `user-${Date.now()}`,
        "user",
        text || "[Voice message]"
      );

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setStatusMessage(null);
      setStreamingText("");

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

                if (event.type === "status") {
                  setStatusMessage(event.message);
                } else if (event.type === "progress") {
                  // Accumulate streaming text
                  setStreamingText((prev) => prev + event.text);
                } else if (event.type === "complete") {
                  handleComplete(event.response);
                } else if (event.type === "error") {
                  handleError(event.error);
                }
                // Ignore tool_use and tool_result events for now
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
    [handleComplete, handleError]
  );

  // Combine messages with streaming message if present
  const allMessages = useMemo(() => {
    if (streamingText) {
      const streamingMessage = createMessage(
        "streaming",
        "assistant",
        streamingText,
        undefined,
        true
      );
      return [...messages, streamingMessage];
    }
    return messages;
  }, [messages, streamingText]);

  // Create assistant-ui runtime
  const runtime = useExternalStoreRuntime({
    messages: allMessages.map(toThreadMessage),
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
    messages: allMessages,
    isLoading,
    statusMessage,
    streamingText,
    sendMessage,
    clearMessages: () => setMessages([]),
    finalizeComplete,
  };
}
