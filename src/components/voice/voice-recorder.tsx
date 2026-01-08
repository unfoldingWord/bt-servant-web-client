"use client";

import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { MicIcon, SquareIcon, XIcon } from "lucide-react";
import { useEffect } from "react";

interface VoiceRecorderProps {
  onComplete: (audioBase64: string, format: string) => void;
  onCancel: () => void;
}

export function VoiceRecorder({ onComplete, onCancel }: VoiceRecorderProps) {
  const {
    isRecording,
    startRecording,
    stopRecording,
    cancelRecording,
    recordingDuration,
  } = useVoiceRecorder();

  // Auto-start recording when component mounts
  useEffect(() => {
    let cancelled = false;

    startRecording().catch((error) => {
      if (!cancelled) {
        console.error("Failed to start recording:", error);
        onCancel();
      }
    });

    return () => {
      cancelled = true;
      cancelRecording();
    };
  }, [startRecording, cancelRecording, onCancel]);

  const handleStop = async () => {
    const result = await stopRecording();
    if (result) {
      onComplete(result.audioBase64, result.format);
    } else {
      onCancel();
    }
  };

  const handleCancel = () => {
    cancelRecording();
    onCancel();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex w-full items-center gap-4 rounded-2xl border border-red-500/50 bg-red-50 p-4 dark:bg-red-950/20">
      <div className="flex flex-1 items-center gap-3">
        <div className="relative">
          <MicIcon className="size-5 text-red-500" />
          {isRecording && (
            <span className="absolute -top-1 -right-1 size-2 animate-pulse rounded-full bg-red-500" />
          )}
        </div>
        <span className="text-sm font-medium">
          {isRecording ? "Recording..." : "Starting..."}
        </span>
        <span className="text-muted-foreground text-sm">
          {formatDuration(recordingDuration)}
        </span>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="icon" onClick={handleCancel}>
          <XIcon className="size-4" />
        </Button>
        <Button
          variant="default"
          size="icon"
          onClick={handleStop}
          disabled={!isRecording}
          className="bg-red-500 hover:bg-red-600"
        >
          <SquareIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}
