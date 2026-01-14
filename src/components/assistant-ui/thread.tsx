"use client";

import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { useChatContext } from "@/components/providers/assistant-provider";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { AudioPlayer } from "@/components/voice/audio-player";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { Button } from "@/components/ui/button";
import {
  ActionBarPrimitive,
  AssistantIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAssistantState,
} from "@assistant-ui/react";
import { ArrowUpIcon, ClipboardIcon } from "@radix-ui/react-icons";
import { Loader2Icon, MicIcon } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLanguage,
  faListUl,
  faCircleInfo,
} from "@fortawesome/pro-regular-svg-icons";
import { useState, type FC } from "react";

const LoadingIndicator: FC = () => {
  const { isLoading, progressStatus } = useChatContext();

  if (!isLoading) return null;

  return (
    <div className="mx-auto w-full max-w-3xl px-2">
      <div className="flex items-center gap-2 text-sm text-[#6b6a68] dark:text-[#9a9893]">
        <Loader2Icon className="size-4 animate-spin" />
        <span className="font-sans italic">
          {progressStatus
            ? progressStatus.replace(/^_|_$/g, "")
            : "Thinking..."}
        </span>
      </div>
    </div>
  );
};

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col items-stretch overscroll-none bg-transparent font-serif">
      {/* Empty state: centered welcome with composer */}
      <ThreadPrimitive.Empty>
        <ThreadWelcome />
      </ThreadPrimitive.Empty>

      {/* After first message: messages with sticky composer */}
      <AssistantIf condition={({ thread }) => !thread.isEmpty}>
        <ThreadPrimitive.Viewport className="flex grow flex-col overflow-y-auto overscroll-none px-4 pt-8">
          <ThreadPrimitive.Messages components={{ Message: ChatMessage }} />
          <LoadingIndicator />
          <div aria-hidden="true" className="min-h-8" />
        </ThreadPrimitive.Viewport>

        {/* Sticky composer outside viewport */}
        <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col px-4 pb-4">
          <Composer />
          <p className="mt-2 text-center font-sans text-xs text-[#9a9893]">
            BT Servant Web Client v1.0.8
          </p>
        </div>
      </AssistantIf>
    </ThreadPrimitive.Root>
  );
};

const SUGGESTIONS = [
  {
    label: "Help me translate John 3:16",
    prompt: "Help me translate John 3:16",
    icon: faLanguage,
    iconColor: "#ae5630", // orange accent
  },
  {
    label: "Summarize Gen 1:1-5",
    prompt: "Can you summarize Genesis 1:1-5?",
    icon: faListUl,
    iconColor: "#7d6b5a", // warm brown
  },
  {
    label: "Tell me about Amos",
    prompt: "Tell me about Amos in the Bible",
    icon: faCircleInfo,
    iconColor: "#5a7d6b", // sage green
  },
];

const ThreadWelcome: FC = () => {
  return (
    <div className="flex flex-1 flex-col">
      {/* Centered content area */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-14">
        <div className="flex w-full max-w-3xl flex-col items-center">
          {/* Welcome message */}
          <div className="mb-8">
            <p className="text-center text-lg text-[#1a1a18] sm:text-2xl dark:text-[#eee]">
              Hello, I&apos;m BT Servant. How can I serve you today?
            </p>
          </div>

          {/* Centered composer */}
          <div className="w-full">
            <Composer />
          </div>

          {/* Suggestions */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((suggestion, index) => (
              <div
                key={suggestion.prompt}
                className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-200"
                style={{ animationDelay: `${100 + index * 50}ms` }}
              >
                <ThreadPrimitive.Suggestion
                  prompt={suggestion.prompt}
                  send
                  asChild
                >
                  <Button
                    variant="outline"
                    className="h-auto gap-2 rounded-lg border-[#00000015] bg-transparent px-4 py-2 font-sans hover:bg-[#f5f5f0] active:scale-[0.98] dark:border-[#6c6a6040] dark:bg-transparent dark:hover:bg-[#393937]"
                  >
                    <FontAwesomeIcon
                      icon={suggestion.icon}
                      className="h-4 w-4"
                      style={{ color: suggestion.iconColor }}
                    />
                    <span className="text-[#1a1a18] dark:text-[#eee]">
                      {suggestion.label}
                    </span>
                  </Button>
                </ThreadPrimitive.Suggestion>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 pb-4">
        <p className="text-center font-sans text-xs text-[#9a9893]">
          BT Servant Web Client v1.0.8
        </p>
      </div>
    </div>
  );
};

const Composer: FC = () => {
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const { sendMessage, isLoading } = useChatContext();
  const voiceRecorder = useVoiceRecorder();

  const handleVoiceComplete = async (audioBase64: string, format: string) => {
    console.log(
      "[Composer] handleVoiceComplete called, base64 length:",
      audioBase64?.length,
      "format:",
      format
    );
    setShowVoiceRecorder(false);
    await sendMessage("", audioBase64, format);
    console.log("[Composer] sendMessage completed");
  };

  if (showVoiceRecorder) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <VoiceRecorder
          onComplete={handleVoiceComplete}
          onCancel={() => setShowVoiceRecorder(false)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <ComposerPrimitive.Root className="flex w-full flex-col rounded-2xl border border-transparent bg-white p-0.5 shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.035),0_0_0_0.5px_rgba(0,0,0,0.08)] transition-shadow duration-200 focus-within:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.075),0_0_0_0.5px_rgba(0,0,0,0.15)] hover:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.05),0_0_0_0.5px_rgba(0,0,0,0.12)] dark:bg-[#1f1e1b] dark:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(108,106,96,0.15)] dark:focus-within:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.5),0_0_0_0.5px_rgba(108,106,96,0.3)] dark:hover:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(108,106,96,0.3)]">
        <div className="m-3.5 flex flex-col gap-3.5">
          <div className="relative">
            <div className="max-h-96 w-full overflow-y-auto">
              <ComposerPrimitive.Input
                placeholder="How can I help you today?"
                className="block min-h-6 w-full resize-none bg-transparent font-sans text-[#1a1a18] outline-none placeholder:text-[#9a9893] dark:text-[#eee] dark:placeholder:text-[#9a9893]"
              />
            </div>
          </div>
          <div className="flex w-full items-center gap-2">
            <div className="relative flex min-w-0 flex-1 shrink items-center gap-2">
              {/* Voice button */}
              {voiceRecorder.isSupported && (
                <button
                  type="button"
                  onClick={() => setShowVoiceRecorder(true)}
                  disabled={isLoading}
                  className="flex h-8 min-w-8 items-center justify-center overflow-hidden rounded-lg border border-[#00000015] bg-transparent px-1.5 text-[#6b6a68] transition-all hover:bg-[#f5f5f0] hover:text-[#1a1a18] active:scale-[0.98] disabled:opacity-50 dark:border-[#6c6a6040] dark:text-[#9a9893] dark:hover:bg-[#393937] dark:hover:text-[#eee]"
                  aria-label="Voice message"
                >
                  <MicIcon width={16} height={16} />
                </button>
              )}
            </div>
            <ComposerPrimitive.Send className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ae5630] transition-colors hover:bg-[#c4633a] active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:bg-[#ae5630] dark:hover:bg-[#c4633a]">
              <ArrowUpIcon width={16} height={16} className="text-white" />
            </ComposerPrimitive.Send>
          </div>
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
};

const ChatMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="group relative mx-auto mt-1 mb-1 block w-full max-w-3xl">
      <AssistantIf condition={({ message }) => message.role === "user"}>
        <UserMessage />
      </AssistantIf>

      <AssistantIf condition={({ message }) => message.role === "assistant"}>
        <AssistantMessage />
      </AssistantIf>
    </MessagePrimitive.Root>
  );
};

const UserMessage: FC = () => {
  const isVoiceMessage = useAssistantState(({ message }) => {
    const firstPart = message.content[0];
    return firstPart?.type === "text" && firstPart.text === "[Voice message]";
  });

  return (
    <div className="mb-6 flex justify-end">
      <div className="inline-flex max-w-[75ch] flex-col gap-2 rounded-xl bg-[#DDD9CE] px-4 py-2.5 text-[#1a1a18] transition-all dark:bg-[#393937] dark:text-[#eee]">
        <div className="whitespace-pre-wrap">
          {isVoiceMessage ? (
            <span className="flex items-center gap-1.5 font-sans text-[#6b6a68] italic dark:text-[#9a9893]">
              <MicIcon className="size-4" />
              Voice message
            </span>
          ) : (
            <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
          )}
        </div>
      </div>
    </div>
  );
};

const AssistantMessage: FC = () => {
  const audioBase64 = useAssistantState(
    ({ message }) => message.metadata?.custom?.audioBase64 as string | undefined
  );

  return (
    <div className="relative mb-12 font-serif">
      <div className="relative leading-[1.65rem]">
        <div className="grid grid-cols-1 gap-2.5">
          <div className="pr-8 pl-2 font-serif whitespace-normal text-[#1a1a18] dark:text-[#eee]">
            <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
          </div>
        </div>
      </div>

      {/* Audio player for voice responses */}
      {audioBase64 && (
        <div className="mt-2 px-2">
          <AudioPlayer audioBase64={audioBase64} />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0">
        <ActionBarPrimitive.Root
          hideWhenRunning
          autohide="not-last"
          className="pointer-events-auto flex w-full translate-y-full flex-col items-end px-2 pt-2 transition"
        >
          <div className="flex items-center text-[#6b6a68] dark:text-[#9a9893]">
            <ActionBarPrimitive.Copy className="flex h-8 w-8 items-center justify-center rounded-md transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-transparent active:scale-95">
              <ClipboardIcon width={20} height={20} />
            </ActionBarPrimitive.Copy>
          </div>
          <AssistantIf condition={({ message }) => message.isLast}>
            <p className="mt-2 w-full text-right font-sans text-[0.65rem] leading-[0.85rem] text-[#8a8985] opacity-90 sm:text-[0.75rem] dark:text-[#b8b5a9]">
              BT Servant can make mistakes. Please double-check responses.
            </p>
          </AssistantIf>
        </ActionBarPrimitive.Root>
      </div>
    </div>
  );
};
