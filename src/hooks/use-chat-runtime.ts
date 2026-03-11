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
  const [isCompleting, setIsCompleting] = useState(false);
  const streamingTextRef = useRef(streamingText);
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    streamingTextRef.current = streamingText;
  }, [streamingText]);

  // Abort polling on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

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
    // React 18+ auto-batches these into a single render
    setIsCompleting(false);
    setIsLoading(false);
    setStatusMessage(null);
    setMessages((prev) => [...prev, pending.message]);
    setStreamingText("");
  }, []);

  // Define handlers before sendMessage so they can be in the dependency array
  const handleComplete = useCallback((data: ChatResponse) => {
    const joinedResponse = data.responses.join("\n\n");
    const currentStreaming = streamingTextRef.current;

    const assistantMessage = createMessage(
      `assistant-${Date.now()}`,
      "assistant",
      joinedResponse,
      data.voice_audio_base64 || undefined
    );

    // If no streaming text was accumulated, swap immediately
    if (!currentStreaming) {
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
      setStatusMessage(null);
      setStreamingText("");
      return;
    }

    // Defer swap: update streaming text to the full response so AnimatedText
    // can animate the remaining characters, then finalizeComplete swaps in
    // the permanent message once the animation catches up.
    pendingCompleteRef.current = { message: assistantMessage };
    setStreamingText(joinedResponse);
    setIsCompleting(true);
    setStatusMessage(null);
  }, []);

  const handleError = useCallback((errorMessage: string) => {
    pendingCompleteRef.current = null;
    setIsCompleting(false);
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
        setIsCompleting(false);
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

      const POLL_INTERVAL_ACTIVE_MS = 600;
      const POLL_INTERVAL_IDLE_MS = 1500;
      const POLL_MAX_TIME_MS = 120_000;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // Step 1: Enqueue message
        const enqueueResponse = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            message_type: audioBase64 ? "audio" : "text",
            audio_base64: audioBase64,
            audio_format: audioFormat,
          }),
          signal: abortController.signal,
        });

        if (!enqueueResponse.ok) {
          const errorBody = await enqueueResponse.text();
          console.error("[sendMessage] enqueue failed", {
            status: enqueueResponse.status,
            body: errorBody,
          });
          throw new Error(`Failed to send message (${enqueueResponse.status})`);
        }

        const { message_id } = await enqueueResponse.json();
        if (!message_id) {
          throw new Error("No message_id returned");
        }

        // Step 2: Poll for events from the browser
        let cursor = 0;
        let pollInterval = POLL_INTERVAL_ACTIVE_MS;
        const startTime = Date.now();
        let handledTerminal = false;

        setStatusMessage("Message queued...");

        while (Date.now() - startTime < POLL_MAX_TIME_MS) {
          const pollResponse = await fetch(
            `/api/chat/stream/poll?message_id=${encodeURIComponent(message_id)}&cursor=${cursor}`,
            { signal: abortController.signal }
          );

          if (!pollResponse.ok) {
            throw new Error(`Poll error: ${pollResponse.status}`);
          }

          const pollData: {
            message_id: string;
            events: { event: string; data: string }[];
            done: boolean;
            cursor: number;
          } = await pollResponse.json();

          for (const event of pollData.events) {
            if (event.event === "done") continue;
            try {
              const parsed: SSEEvent = JSON.parse(event.data);

              if (parsed.type === "status") {
                setStatusMessage(parsed.message);
              } else if (parsed.type === "progress") {
                // Guard: ignore progress chunks that arrive after a complete/error
                // event. Without this, straggling chunks append to streamingText
                // AFTER handleComplete has already set it to the final joined
                // response, causing a text divergence that triggers the animation
                // guard in useAnimatedText. See: docs/streaming-animation.md
                if (!handledTerminal) {
                  setStreamingText((prev) => prev + parsed.text);
                }
              } else if (parsed.type === "complete") {
                handleComplete(parsed.response);
                handledTerminal = true;
              } else if (parsed.type === "error") {
                handleError(parsed.error);
                handledTerminal = true;
              }
            } catch {
              // Ignore parse errors for individual events
            }
          }

          cursor = pollData.cursor;

          if (pollData.done) {
            if (!handledTerminal) {
              setIsLoading(false);
              setStatusMessage(null);
            }
            return;
          }

          // Adaptive polling: fast when events flowing, ramp up when idle
          pollInterval =
            pollData.events.length > 0
              ? POLL_INTERVAL_ACTIVE_MS
              : Math.min(pollInterval + 200, POLL_INTERVAL_IDLE_MS);

          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        // Timeout
        handleError("Request timed out after 2 minutes.");
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          setIsLoading(false);
          setStatusMessage(null);
          return;
        }
        console.error("[sendMessage] error", error);
        handleError("Sorry, I encountered an error. Please try again.");
      } finally {
        abortControllerRef.current = null;
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
    isCompleting,
  };
}
