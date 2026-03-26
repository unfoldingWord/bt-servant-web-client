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

export function useChatRuntime() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string>("");
  const [isAudioRequest, setIsAudioRequest] = useState(false);
  const isAudioRequestRef = useRef(false);
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
          audioUrl: entry.voice_audio_url
            ? `/api/audio?url=${encodeURIComponent(entry.voice_audio_url)}`
            : undefined,
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
    const hasAudio = !!data.voice_audio_base64 || !!data.voice_audio_url;

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

      const POLL_INTERVAL_ACTIVE_MS = 600;
      const POLL_INTERVAL_IDLE_MS = 1500;
      const POLL_HARD_MAX_MS = 300_000; // 5 min absolute ceiling
      const POLL_INACTIVITY_DEFAULT_MS = 120_000; // 2 min without any event = dead
      const POLL_INACTIVITY_AUDIO_GEN_MS = 300_000; // 5 min during TTS (matches hard max)

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
        let lastActivityTime = startTime;
        let inactivityLimit = POLL_INACTIVITY_DEFAULT_MS;
        let handledTerminal = false;

        setStatusMessage("Message queued...");

        while (
          Date.now() - startTime < POLL_HARD_MAX_MS &&
          Date.now() - lastActivityTime < inactivityLimit
        ) {
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

          if (pollData.events.length > 0) {
            lastActivityTime = Date.now();
          }

          for (const event of pollData.events) {
            if (event.event === "done") continue;
            try {
              const parsed: SSEEvent = JSON.parse(event.data);

              if (parsed.type === "status") {
                setStatusMessage(parsed.message);
                // TTS can take minutes for long responses — extend inactivity
                // window for all audio requests, plus keyword fallback for
                // text requests that unexpectedly generate audio
                if (isAudioRequestRef.current) {
                  inactivityLimit = POLL_INACTIVITY_AUDIO_GEN_MS;
                } else {
                  const statusLower = parsed.message.toLowerCase();
                  if (
                    statusLower.includes("audio") ||
                    statusLower.includes("tts") ||
                    statusLower.includes("speech")
                  ) {
                    inactivityLimit = POLL_INACTIVITY_AUDIO_GEN_MS;
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
                    "[poll] ignoring late progress chunk after terminal event"
                  );
                }
              } else if (parsed.type === "complete") {
                handleComplete(parsed.response);
                handledTerminal = true;
              } else if (parsed.type === "error") {
                console.error("[poll] error event:", parsed.error);
                handleError(parsed.error);
                handledTerminal = true;
              } else {
                console.warn("[poll] unknown event type:", parsed.type);
              }
            } catch (e) {
              console.error("[poll] failed to parse event:", event, e);
            }
          }

          cursor = pollData.cursor;

          if (pollData.done) {
            if (!handledTerminal) {
              console.warn(
                "[poll] done but no terminal event was handled — resetting state"
              );
              setIsLoading(false);
              setIsAudioRequest(false);
              isAudioRequestRef.current = false;
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

        // Timeout — either hard max (5 min) or inactivity
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const inactive = Math.round((Date.now() - lastActivityTime) / 1000);
        const reason =
          Date.now() - lastActivityTime >= inactivityLimit
            ? `No response activity for ${inactive}s`
            : `Request exceeded ${Math.round(POLL_HARD_MAX_MS / 1000)}s limit`;

        handleError(`${reason} (elapsed ${elapsed}s).`);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          setIsLoading(false);
          setIsAudioRequest(false);
          isAudioRequestRef.current = false;
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
