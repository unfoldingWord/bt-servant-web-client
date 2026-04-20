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
  audioUrl?: string;
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
        audioUrl: message.audioUrl,
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
  opts?: { audioBase64?: string; audioUrl?: string; isStreaming?: boolean }
): ChatMessage {
  return {
    id,
    role,
    content: [{ type: "text" as const, text: content }],
    createdAt: new Date(),
    audioBase64: opts?.audioBase64,
    audioUrl: opts?.audioUrl,
    isStreaming: opts?.isStreaming,
  };
}

export function useChatRuntime(org: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string>("");
  const [isAudioRequest, setIsAudioRequest] = useState(false);
  const isAudioRequestRef = useRef(false);
  const pendingCompleteRef = useRef<{ message: ChatMessage } | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const streamingTextRef = useRef(streamingText);
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    streamingTextRef.current = streamingText;
  }, [streamingText]);

  // Abort streaming on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Load chat history and convert to ChatMessage format
  const loadHistory = useCallback(
    async (signal?: AbortSignal): Promise<ChatMessage[]> => {
      try {
        const response = await fetch(
          `/api/chat/history?org=${encodeURIComponent(org)}`,
          { signal }
        );
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
            createdAt: entry.created_at
              ? new Date(entry.created_at)
              : new Date(),
          });

          // Add assistant message
          historyMessages.push({
            id: `history-assistant-${i}`,
            role: "assistant",
            content: [
              { type: "text" as const, text: entry.assistant_response },
            ],
            createdAt: entry.created_at
              ? new Date(entry.created_at)
              : new Date(),
            audioUrl: entry.voice_audio_url
              ? `/api/audio?url=${encodeURIComponent(entry.voice_audio_url)}`
              : undefined,
          });
        });

        return historyMessages;
      } catch {
        return [];
      }
    },
    [org]
  );

  // Load history on mount and when org changes
  useEffect(() => {
    // On org change, reset state and reload
    abortControllerRef.current?.abort();
    setMessages([]);
    setStreamingText("");
    setIsLoading(false);
    setStatusMessage(null);
    pendingCompleteRef.current = null;

    const historyAbort = new AbortController();

    loadHistory(historyAbort.signal).then((historyMessages) => {
      if (historyMessages.length > 0) {
        setMessages(historyMessages);
      }
    });

    return () => {
      historyAbort.abort();
    };
  }, [loadHistory]);

  // Finalize a pending completion — called by AnimatedText when animation catches up
  const finalizeComplete = useCallback(() => {
    const pending = pendingCompleteRef.current;
    if (!pending) {
      console.warn("[finalizeComplete] called but no pending message");
      return;
    }

    pendingCompleteRef.current = null;
    // React 18+ auto-batches these into a single render
    setIsCompleting(false);
    setIsLoading(false);
    setIsAudioRequest(false);
    setStatusMessage(null);
    setMessages((prev) => [...prev, pending.message]);
    setStreamingText("");
  }, []);

  // Define handlers before sendMessage so they can be in the dependency array
  const handleComplete = useCallback((data: ChatResponse) => {
    const joinedResponse = data.responses.join("\n\n");
    const currentStreaming = streamingTextRef.current;
    const audioUrl = data.voice_audio_url
      ? `/api/audio?url=${encodeURIComponent(data.voice_audio_url)}`
      : undefined;

    const assistantMessage = createMessage(
      `assistant-${Date.now()}`,
      "assistant",
      joinedResponse,
      {
        audioBase64: data.voice_audio_base64 || undefined,
        audioUrl,
      }
    );

    // For audio requests or when no streaming text was shown, swap immediately.
    // AnimatedText is not rendered for audio requests so the deferred path
    // would never call finalizeComplete.
    if (!currentStreaming || isAudioRequestRef.current) {
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
      setIsAudioRequest(false);
      isAudioRequestRef.current = false;
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
    console.error("[handleError]", errorMessage);
    pendingCompleteRef.current = null;
    setIsCompleting(false);
    setIsAudioRequest(false);
    isAudioRequestRef.current = false;
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
      setIsAudioRequest(!!audioBase64);
      isAudioRequestRef.current = !!audioBase64;
      setStatusMessage(null);
      setStreamingText("");

      const HARD_MAX_MS = 300_000; // 5 min absolute ceiling
      const INACTIVITY_DEFAULT_MS = 120_000; // 2 min without any event = dead
      const INACTIVITY_AUDIO_GEN_MS = 300_000; // 5 min during TTS (matches hard max)

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let hardMaxTimer: ReturnType<typeof setTimeout> | null = null;
      let inactivityTimer: ReturnType<typeof setInterval> | null = null;
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      try {
        // Hard max timeout — abort the stream after 5 min no matter what
        hardMaxTimer = setTimeout(() => abortController.abort(), HARD_MAX_MS);

        // Inactivity tracking — abort if no SSE events for too long
        let lastEventTime = Date.now();
        let inactivityLimit = INACTIVITY_DEFAULT_MS;
        inactivityTimer = setInterval(() => {
          if (Date.now() - lastEventTime >= inactivityLimit) {
            abortController.abort();
          }
        }, 5_000);

        // SSE fetch — BFF proxies upstream SSE stream
        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            message_type: audioBase64 ? "audio" : "text",
            audio_base64: audioBase64,
            audio_format: audioFormat,
            org,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          console.error("[sendMessage] stream request failed", {
            status: response.status,
            body: errorBody,
          });
          throw new Error(`Failed to send message (${response.status})`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        // Stream reader with SSE line-buffered parser
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let handledTerminal = false;

        setStatusMessage("Connecting...");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Split on double newlines (SSE event boundary)
          const events = buffer.split("\n\n");
          // Last element may be incomplete — keep in buffer
          buffer = events.pop() || "";

          for (const eventBlock of events) {
            if (!eventBlock.trim()) continue;

            // Extract data line from SSE format
            const dataLine = eventBlock
              .split("\n")
              .find((line) => line.startsWith("data: "));
            if (!dataLine) continue;

            const jsonStr = dataLine.slice(6); // strip "data: "

            try {
              const parsed: SSEEvent = JSON.parse(jsonStr);
              lastEventTime = Date.now();

              if (parsed.type === "status") {
                setStatusMessage(parsed.message);
                // TTS can take minutes for long responses — extend inactivity
                // window for all audio requests, plus keyword fallback for
                // text requests that unexpectedly generate audio
                if (isAudioRequestRef.current) {
                  inactivityLimit = INACTIVITY_AUDIO_GEN_MS;
                } else {
                  const statusLower = parsed.message.toLowerCase();
                  if (
                    statusLower.includes("audio") ||
                    statusLower.includes("tts") ||
                    statusLower.includes("speech")
                  ) {
                    inactivityLimit = INACTIVITY_AUDIO_GEN_MS;
                  }
                }
              } else if (parsed.type === "progress") {
                // Guard: ignore progress chunks that arrive after a complete/error
                // event. Without this, straggling chunks append to streamingText
                // AFTER handleComplete has already set it to the final joined
                // response, causing a text divergence that triggers the animation
                // guard in useAnimatedText. See: docs/streaming-animation.md
                if (!handledTerminal) {
                  setStreamingText((prev) => prev + parsed.text);
                } else {
                  console.warn(
                    "[sse] ignoring late progress chunk after terminal event"
                  );
                }
              } else if (parsed.type === "complete") {
                handleComplete(parsed.response);
                handledTerminal = true;
              } else if (parsed.type === "error") {
                console.error("[sse] error event:", parsed.error);
                handleError(parsed.error);
                handledTerminal = true;
              } else if (parsed.type === "keepalive") {
                // no-op — lastEventTime already updated above
              } else if (
                parsed.type === "tool_use" ||
                parsed.type === "tool_result"
              ) {
                console.debug("[sse] tool event:", parsed.type, parsed);
              }
            } catch (e) {
              console.error("[sse] failed to parse event:", jsonStr, e);
            }
          }
        }

        // Stream ended — ensure we got a terminal event
        if (!handledTerminal) {
          console.warn("[sse] stream ended without terminal event");
          handleError("Connection lost. Please try again.");
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          pendingCompleteRef.current = null;
          setIsCompleting(false);
          setIsLoading(false);
          setIsAudioRequest(false);
          isAudioRequestRef.current = false;
          setStatusMessage(null);
          setStreamingText("");
          return;
        }
        console.error("[sendMessage] error", error);
        handleError("Sorry, I encountered an error. Please try again.");
      } finally {
        if (hardMaxTimer) clearTimeout(hardMaxTimer);
        if (inactivityTimer) clearInterval(inactivityTimer);
        try {
          reader?.releaseLock();
        } catch {
          /* already released */
        }
        abortControllerRef.current = null;
      }
    },
    [handleComplete, handleError, org]
  );

  // Combine messages with streaming message if present.
  // For audio requests, suppress the visible streaming text — the user
  // will only see the audio player (with optional transcript toggle).
  const allMessages = useMemo(() => {
    if (streamingText && !isAudioRequest) {
      const streamingMessage = createMessage(
        "streaming",
        "assistant",
        streamingText,
        { isStreaming: true }
      );
      return [...messages, streamingMessage];
    }
    return messages;
  }, [messages, streamingText, isAudioRequest]);

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
    isAudioRequest,
    statusMessage,
    streamingText,
    sendMessage,
    clearMessages: () => setMessages([]),
    finalizeComplete,
    isCompleting,
  };
}
