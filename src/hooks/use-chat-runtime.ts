"use client";

import {
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { track } from "@/lib/analytics";
import type { MessageKey } from "@/i18n";
import { VOICE_MESSAGE_SENTINEL } from "@/lib/voice-message";
import {
  isWorkerStatusKey,
  TTS_STATUS_KEYS,
  type Attachment,
  type ChatResponse,
  type ChatHistoryResponse,
  type SSEEvent,
  type WorkerStatusKey,
} from "@/types/engine";

type TimeoutReason = "hard_max_timeout" | "inactivity_timeout";
/** Why a turn failed; the `reason` property on `chat_response_failed`. */
type ChatFailureReason = TimeoutReason | "error";

// The hook is locale-agnostic: it never holds user-facing copy, only the
// dictionary keys below. The thread translates them at render time.

/** Canned error copy the runtime can attach to an assistant message. */
export type ErrorKey = Extract<MessageKey, `error.${string}`>;
/** Status copy the runtime shows on its own, before the worker says anything. */
export type StatusKey = Extract<MessageKey, `status.${string}`>;

/**
 * What the loading indicator shows: a key the view translates, or status text
 * from the worker, rendered as-is (the worker localizes it from the same
 * stored preference). A worker status also carries its structured `key` when
 * it is one the client knows, so the view can act on it later.
 */
export type RuntimeStatus =
  | { key: StatusKey }
  | { text: string; key?: WorkerStatusKey };

// TTS can take minutes for long responses, so a TTS status extends the
// inactivity window. The worker's structured `key` (bt-servant-worker#407) is
// authoritative whenever it is one we know, since `message` is localized and
// may contain no English. An unknown key (a newer worker) and no key (an
// older worker) both fall back to the keyword match on `message`. Both are
// data, not copy: never localize them.
const TTS_STATUS_KEYWORDS = ["audio", "tts", "speech"];

function isTtsStatus(message: string, key?: WorkerStatusKey): boolean {
  if (key !== undefined) return TTS_STATUS_KEYS.has(key);
  const statusLower = message.toLowerCase();
  return TTS_STATUS_KEYWORDS.some((keyword) => statusLower.includes(keyword));
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: Array<{ type: "text"; text: string }>;
  createdAt: Date;
  audioBase64?: string;
  audioUrl?: string;
  isStreaming?: boolean;
  attachments?: Attachment[];
  /**
   * Set on the canned error messages the runtime appends. The text content
   * is left empty; the thread renders `t(errorKey)` instead.
   */
  errorKey?: ErrorKey;
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
        attachments: message.attachments,
        errorKey: message.errorKey,
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
  opts?: {
    audioBase64?: string;
    audioUrl?: string;
    isStreaming?: boolean;
    attachments?: Attachment[];
    errorKey?: ErrorKey;
  }
): ChatMessage {
  return {
    id,
    role,
    content: [{ type: "text" as const, text: content }],
    createdAt: new Date(),
    audioBase64: opts?.audioBase64,
    audioUrl: opts?.audioUrl,
    isStreaming: opts?.isStreaming,
    attachments: opts?.attachments,
    errorKey: opts?.errorKey,
  };
}

/**
 * `languageHint`: the ISO 639-1 code of the current interface locale, sent
 * as `response_language_hint` on every chat request so the reply language
 * never depends on the preference PUT having landed. Read through a ref at
 * send time; it is deliberately not a `sendMessage` dependency
 * (docs/streaming-animation.md).
 */
export function useChatRuntime({
  languageHint,
}: { languageHint?: string } = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [streamingText, setStreamingText] = useState<string>("");
  const [isAudioRequest, setIsAudioRequest] = useState(false);
  const isAudioRequestRef = useRef(false);
  const pendingCompleteRef = useRef<{ message: ChatMessage } | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const streamingTextRef = useRef(streamingText);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sentAtRef = useRef<number | null>(null);
  const languageHintRef = useRef(languageHint);
  useEffect(() => {
    languageHintRef.current = languageHint;
  }, [languageHint]);
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
        const response = await fetch(`/api/chat/history`, { signal });
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
            attachments: entry.attachments?.length
              ? entry.attachments
              : undefined,
          });
        });

        return historyMessages;
      } catch {
        return [];
      }
    },
    []
  );

  // Load history on mount
  useEffect(() => {
    abortControllerRef.current?.abort();
    setStreamingText("");
    setIsLoading(false);
    setStatus(null);
    pendingCompleteRef.current = null;

    const historyAbort = new AbortController();

    loadHistory(historyAbort.signal).then((historyMessages) => {
      if (!historyAbort.signal.aborted) {
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
    setStatus(null);
    setMessages((prev) => [...prev, pending.message]);
    setStreamingText("");
  }, []);

  // Define handlers before sendMessage so they can be in the dependency array
  const handleComplete = useCallback((data: ChatResponse) => {
    track("chat_response_received", {
      response_count: data.responses.length,
      has_audio: Boolean(data.voice_audio_url || data.voice_audio_base64),
      has_attachments: Boolean(data.attachments?.length),
      duration_ms: sentAtRef.current
        ? Date.now() - sentAtRef.current
        : undefined,
    });
    sentAtRef.current = null;
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
        attachments: data.attachments?.length ? data.attachments : undefined,
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
      setStatus(null);
      setStreamingText("");
      return;
    }

    // Defer swap: update streaming text to the full response so AnimatedText
    // can animate the remaining characters, then finalizeComplete swaps in
    // the permanent message once the animation catches up.
    pendingCompleteRef.current = { message: assistantMessage };
    setStreamingText(joinedResponse);
    setIsCompleting(true);
    setStatus(null);
  }, []);

  // Appends a canned error turn. The copy is chosen at render time from
  // `errorKey`; the raw cause is only ever logged. `reason` is the analytics
  // dimension on `chat_response_failed` and is independent of the copy.
  const handleError = useCallback(
    (errorKey: ErrorKey, reason: ChatFailureReason = "error") => {
      console.error("[handleError]", reason, errorKey);
      track("chat_response_failed", {
        reason,
        duration_ms: sentAtRef.current
          ? Date.now() - sentAtRef.current
          : undefined,
      });
      sentAtRef.current = null;
      pendingCompleteRef.current = null;
      setIsCompleting(false);
      setIsAudioRequest(false);
      isAudioRequestRef.current = false;
      setMessages((prev) => [
        ...prev,
        createMessage(`error-${Date.now()}`, "assistant", "", { errorKey }),
      ]);
      setIsLoading(false);
      setStatus(null);
      setStreamingText("");
    },
    []
  );

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
        text || VOICE_MESSAGE_SENTINEL
      );

      setMessages((prev) => [...prev, userMessage]);
      // Counts and flags only — never the message text.
      sentAtRef.current = Date.now();
      track("chat_message_sent", {
        message_type: audioBase64 ? "audio" : "text",
        text_length: text.length,
      });
      setIsLoading(true);
      setIsAudioRequest(!!audioBase64);
      isAudioRequestRef.current = !!audioBase64;
      setStatus(null);
      setStreamingText("");

      const HARD_MAX_MS = 300_000; // 5 min absolute ceiling
      const INACTIVITY_DEFAULT_MS = 120_000; // 2 min without any event = dead
      const INACTIVITY_AUDIO_GEN_MS = 300_000; // 5 min during TTS (matches hard max)

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let hardMaxTimer: ReturnType<typeof setTimeout> | null = null;
      let inactivityTimer: ReturnType<typeof setInterval> | null = null;
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      // Why the stream was aborted. Only our own timers set this; an abort
      // from unmount / a new request (user cancellation) leaves it null.
      // Tracked out-of-band rather than via `abort(reason)` because fetch
      // rejects with the reason itself, which would no longer be an AbortError.
      let timeoutReason: TimeoutReason | null = null;
      let handledTerminal = false;

      try {
        // Hard max timeout — abort the stream after 5 min no matter what
        hardMaxTimer = setTimeout(() => {
          timeoutReason = "hard_max_timeout";
          abortController.abort();
        }, HARD_MAX_MS);

        // Inactivity tracking — abort if no SSE events for too long
        let lastEventTime = Date.now();
        let inactivityLimit = INACTIVITY_DEFAULT_MS;
        inactivityTimer = setInterval(() => {
          if (Date.now() - lastEventTime >= inactivityLimit) {
            timeoutReason = "inactivity_timeout";
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
            response_language_hint: languageHintRef.current,
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

        setStatus({ key: "status.connecting" });

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
                // The worker's message is already localized; render as-is.
                const key =
                  parsed.key !== undefined && isWorkerStatusKey(parsed.key)
                    ? parsed.key
                    : undefined;
                setStatus(
                  key === undefined
                    ? { text: parsed.message }
                    : { text: parsed.message, key }
                );
                // Extend the inactivity window for every audio request, and
                // for a text request that unexpectedly reaches TTS.
                if (
                  isAudioRequestRef.current ||
                  isTtsStatus(parsed.message, key)
                ) {
                  inactivityLimit = INACTIVITY_AUDIO_GEN_MS;
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
                // Log raw, show canned fallback — never render the worker's
                // error string (may be a raw upstream API body) in the chat
                console.error("[sse] error event:", parsed.error);
                handleError("error.generic");
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
          handleError("error.connectionLost");
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          // Our own timers aborted: that is a failed response, not a
          // cancellation, so it must show up in `chat_response_failed`.
          if (timeoutReason && !handledTerminal) {
            handleError("error.timeout", timeoutReason);
            return;
          }
          // Unmount / superseded request: reset silently.
          sentAtRef.current = null;
          pendingCompleteRef.current = null;
          setIsCompleting(false);
          setIsLoading(false);
          setIsAudioRequest(false);
          isAudioRequestRef.current = false;
          setStatus(null);
          setStreamingText("");
          return;
        }
        console.error("[sendMessage] error", error);
        handleError("error.generic");
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
    status,
    streamingText,
    sendMessage,
    clearMessages: () => setMessages([]),
    finalizeComplete,
    isCompleting,
  };
}
