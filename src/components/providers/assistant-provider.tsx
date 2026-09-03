"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, type RuntimeStatus } from "@/hooks/use-chat-runtime";
import { createContext, useContext, useState, ReactNode } from "react";
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
  // Every chat request carries the preference owner's hint (see
  // LocalePreferenceProvider.responseLanguageHint), so the reply language
  // never depends on the preference PUT having landed, and never on the
  // chrome's browser fallback before the stored value has loaded.
  const [languageHint, setLanguageHint] = useState<string | undefined>();
  const {
    runtime,
    sendMessage,
    isLoading,
    isAudioRequest,
    status,
    streamingText,
    finalizeComplete,
    isCompleting,
  } = useChatRuntime({ languageHint });

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
          provider holds a loaded preference and the picker locks itself.
          `isCompleting` is named so the hold does not rest on isLoading
          happening to stay true through the completing phase. */}
      <LocalePreferenceProvider
        hold={isLoading || isCompleting}
        onResponseLanguageHintChange={setLanguageHint}
      >
        <AssistantRuntimeProvider runtime={runtime}>
          {children}
        </AssistantRuntimeProvider>
      </LocalePreferenceProvider>
    </ChatContext.Provider>
  );
}
