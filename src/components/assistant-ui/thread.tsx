"use client";

import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatContext } from "@/components/providers/assistant-provider";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { AudioPlayer } from "@/components/voice/audio-player";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import {
  ActionBarPrimitive,
  AssistantIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  Loader2Icon,
  MicIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import type { FC } from "react";
import { useState } from "react";

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root
      className="bg-background flex h-full flex-col"
      style={{
        ["--thread-max-width" as string]: "44rem",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth px-4 pt-4"
      >
        <AssistantIf condition={({ thread }) => thread.isEmpty}>
          <ThreadWelcome />
        </AssistantIf>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            EditComposer,
            AssistantMessage,
          }}
        />

        <ThreadPrimitive.ViewportFooter className="bg-background sticky bottom-0 mx-auto mt-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-4 overflow-visible rounded-t-3xl pb-4 md:pb-6">
          <ThreadScrollToBottom />
          <Composer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <div className="mx-auto my-auto flex w-full max-w-[var(--thread-max-width)] grow flex-col">
      <div className="flex w-full grow flex-col items-center justify-center">
        <div className="flex size-full flex-col justify-center px-4">
          <h1 className="fade-in slide-in-from-bottom-1 animate-in text-2xl font-semibold duration-200">
            Hello there!
          </h1>
          <p className="fade-in slide-in-from-bottom-1 animate-in text-muted-foreground text-xl delay-75 duration-200">
            I&apos;m your Bible Translation assistant. How can I help you today?
          </p>
        </div>
      </div>
      <ThreadSuggestions />
    </div>
  );
};

const SUGGESTIONS = [
  {
    title: "Summarize a passage",
    label: "Genesis 1:1-5",
    prompt: "Can you summarize Genesis 1:1-5?",
  },
  {
    title: "Translation help",
    label: "for John 3:16",
    prompt: "Help me with translation challenges in John 3:16",
  },
] as const;

const ThreadSuggestions: FC = () => {
  return (
    <div className="grid w-full gap-2 pb-4 md:grid-cols-2">
      {SUGGESTIONS.map((suggestion, index) => (
        <div
          key={suggestion.prompt}
          className="fade-in slide-in-from-bottom-2 animate-in fill-mode-both duration-200"
          style={{ animationDelay: `${100 + index * 50}ms` }}
        >
          <ThreadPrimitive.Suggestion prompt={suggestion.prompt} send asChild>
            <Button
              variant="ghost"
              className="hover:bg-muted h-auto w-full flex-wrap items-start justify-start gap-1 rounded-2xl border px-4 py-3 text-left text-sm transition-colors md:flex-col"
              aria-label={suggestion.prompt}
            >
              <span className="font-medium">{suggestion.title}</span>
              <span className="text-muted-foreground">{suggestion.label}</span>
            </Button>
          </ThreadPrimitive.Suggestion>
        </div>
      ))}
    </div>
  );
};

const Composer: FC = () => {
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const { sendMessage, isLoading, progressStatus } = useChatContext();
  const voiceRecorder = useVoiceRecorder();

  const handleVoiceComplete = async (audioBase64: string, format: string) => {
    setShowVoiceRecorder(false);
    await sendMessage("", audioBase64, format);
  };

  if (showVoiceRecorder) {
    return (
      <VoiceRecorder
        onComplete={handleVoiceComplete}
        onCancel={() => setShowVoiceRecorder(false)}
      />
    );
  }

  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col">
      {/* Progress indicator */}
      {isLoading && (
        <div className="text-muted-foreground mb-2 flex items-center gap-2 px-2 text-sm">
          <Loader2Icon className="size-4 animate-spin" />
          <span className="italic">
            {progressStatus
              ? progressStatus.replace(/^_|_$/g, "")
              : "Thinking..."}
          </span>
        </div>
      )}
      <div className="border-input bg-background has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-ring/20 flex w-full flex-col rounded-2xl border px-1 pt-2 transition-shadow outline-none has-[textarea:focus-visible]:ring-2">
        <ComposerPrimitive.Input
          placeholder="Send a message..."
          className="placeholder:text-muted-foreground mb-1 max-h-32 min-h-14 w-full resize-none bg-transparent px-4 pt-2 pb-3 text-sm outline-none focus-visible:ring-0"
          rows={1}
          autoFocus
          aria-label="Message input"
        />
        <div className="relative mx-2 mb-2 flex items-center justify-between">
          {/* Voice button */}
          {voiceRecorder.isSupported && (
            <TooltipIconButton
              tooltip="Voice message"
              onClick={() => setShowVoiceRecorder(true)}
              disabled={isLoading}
              className="size-8"
            >
              <MicIcon className="size-4" />
            </TooltipIconButton>
          )}
          {!voiceRecorder.isSupported && <div />}

          <AssistantIf condition={({ thread }) => !thread.isRunning}>
            <ComposerPrimitive.Send asChild>
              <TooltipIconButton
                tooltip="Send message"
                side="bottom"
                type="submit"
                variant="default"
                size="icon"
                className="size-8 rounded-full"
                aria-label="Send message"
              >
                <ArrowUpIcon className="size-4" />
              </TooltipIconButton>
            </ComposerPrimitive.Send>
          </AssistantIf>

          <AssistantIf condition={({ thread }) => thread.isRunning}>
            <ComposerPrimitive.Cancel asChild>
              <Button
                type="button"
                variant="default"
                size="icon"
                className="size-8 rounded-full"
                aria-label="Stop generating"
              >
                <SquareIcon className="size-3 fill-current" />
              </Button>
            </ComposerPrimitive.Cancel>
          </AssistantIf>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
};

const AssistantMessage: FC = () => {
  const { lastAudioResponse } = useChatContext();

  return (
    <MessagePrimitive.Root
      className="fade-in slide-in-from-bottom-1 animate-in relative mx-auto w-full max-w-[var(--thread-max-width)] py-3 duration-150"
      data-role="assistant"
    >
      <div className="text-foreground px-2 leading-relaxed wrap-break-word">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
          }}
        />
      </div>

      {/* Audio player for voice responses */}
      <MessagePrimitive.If lastOrHover>
        {lastAudioResponse && (
          <div className="mt-2 px-2">
            <AudioPlayer audioBase64={lastAudioResponse} autoPlay />
          </div>
        )}
      </MessagePrimitive.If>

      <div className="mt-1 ml-2 flex">
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="text-muted-foreground data-[floating]:bg-background col-start-3 row-start-2 -ml-1 flex gap-1 data-[floating]:absolute data-[floating]:rounded-md data-[floating]:border data-[floating]:p-1 data-[floating]:shadow-sm"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <AssistantIf condition={({ message }) => message.isCopied}>
            <CheckIcon />
          </AssistantIf>
          <AssistantIf condition={({ message }) => !message.isCopied}>
            <CopyIcon />
          </AssistantIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="fade-in slide-in-from-bottom-1 animate-in mx-auto grid w-full max-w-[var(--thread-max-width)] auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-3 duration-150 [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <div className="relative col-start-2 min-w-0">
        <div className="bg-muted text-foreground rounded-2xl px-4 py-2.5 wrap-break-word">
          <MessagePrimitive.Parts />
        </div>
        <div className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker className="col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="p-4">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root className="mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col px-2 py-3">
      <ComposerPrimitive.Root className="bg-muted ml-auto flex w-full max-w-[85%] flex-col rounded-2xl">
        <ComposerPrimitive.Input
          className="text-foreground min-h-14 w-full resize-none bg-transparent p-4 text-sm outline-none"
          autoFocus
        />
        <div className="mx-3 mb-3 flex items-center gap-2 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm">Update</Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "text-muted-foreground mr-2 -ml-2 inline-flex items-center text-xs",
        className
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
