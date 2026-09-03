"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, type RuntimeStatus } from "@/hooks/use-chat-runtime";
import { createContext, useContext, ReactNode } from "react";
import { LocalePreferenceProvider } from "./locale-preference-provider";

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
      {/* The stored language preference lives with the authenticated area
          (its BFF route needs a session). While a reply is in flight the
          provider holds a loaded preference and the picker locks itself. */}
      <LocalePreferenceProvider hold={isLoading}>
        <AssistantRuntimeProvider runtime={runtime}>
          {children}
        </AssistantRuntimeProvider>
      </LocalePreferenceProvider>
    </ChatContext.Provider>
  );
}
