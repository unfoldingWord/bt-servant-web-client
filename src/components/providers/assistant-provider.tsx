"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@/hooks/use-chat-runtime";
import { useOrg } from "@/hooks/use-org";
import { createContext, useContext, ReactNode } from "react";

interface ChatContextValue {
  sendMessage: (
    text: string,
    audioBase64?: string,
    audioFormat?: string
  ) => Promise<void>;
  isLoading: boolean;
  isAudioRequest: boolean;
  statusMessage: string | null;
  streamingText: string;
  finalizeComplete: () => void;
  isCompleting: boolean;
  org: string;
  setOrg: (org: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx)
    throw new Error("useChatContext must be used within AssistantProvider");
  return ctx;
}

export function AssistantProvider({
  children,
  defaultOrg,
}: {
  children: ReactNode;
  defaultOrg: string;
}) {
  const { org, setOrg } = useOrg(defaultOrg);
  const {
    runtime,
    sendMessage,
    isLoading,
    isAudioRequest,
    statusMessage,
    streamingText,
    finalizeComplete,
    isCompleting,
  } = useChatRuntime(org);

  return (
    <ChatContext.Provider
      value={{
        sendMessage,
        isLoading,
        isAudioRequest,
        statusMessage,
        streamingText,
        finalizeComplete,
        isCompleting,
        org,
        setOrg,
      }}
    >
      <AssistantRuntimeProvider runtime={runtime}>
        {children}
      </AssistantRuntimeProvider>
    </ChatContext.Provider>
  );
}
