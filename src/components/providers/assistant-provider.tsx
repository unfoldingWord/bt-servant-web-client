"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, type RuntimeStatus } from "@/hooks/use-chat-runtime";
import { usePreferredLocale } from "@/hooks/use-preferred-locale";
import { createContext, useContext, ReactNode } from "react";

interface ChatContextValue {
  sendMessage: (
    text: string,
    audioBase64?: string,
    audioFormat?: string
  ) => Promise<void>;
  isLoading: boolean;
  isAudioRequest: boolean;
  status: RuntimeStatus | null;
  streamingText: string;
  finalizeComplete: () => void;
  isCompleting: boolean;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx)
    throw new Error("useChatContext must be used within AssistantProvider");
  return ctx;
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const {
    runtime,
    sendMessage,
    isLoading,
    isAudioRequest,
    status,
    streamingText,
    finalizeComplete,
    isCompleting,
  } = useChatRuntime();

  // Stored language preference (one setting with the reply language). Held
  // while a reply is in flight so the chrome never flips mid-stream.
  usePreferredLocale({ paused: isLoading });

  return (
    <ChatContext.Provider
      value={{
        sendMessage,
        isLoading,
        isAudioRequest,
        status,
        streamingText,
        finalizeComplete,
        isCompleting,
      }}
    >
      <AssistantRuntimeProvider runtime={runtime}>
        {children}
      </AssistantRuntimeProvider>
    </ChatContext.Provider>
  );
}
