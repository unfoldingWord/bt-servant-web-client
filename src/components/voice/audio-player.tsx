"use client";

import { Button } from "@/components/ui/button";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { PauseIcon, PlayIcon, Volume2Icon } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  audioBase64: string;
  format?: string;
  autoPlay?: boolean;
  className?: string;
}

export function AudioPlayer({
  audioBase64,
  format = "mp3",
  autoPlay = false,
  className,
}: AudioPlayerProps) {
  const { isPlaying, currentTime, duration, play, pause } = useAudioPlayer();

  useEffect(() => {
    if (autoPlay) {
      play(audioBase64, format);
    }
  }, [audioBase64, format, autoPlay, play]);

  const handleToggle = () => {
    if (isPlaying) {
      pause();
    } else {
      play(audioBase64, format);
    }
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "bg-muted flex items-center gap-3 rounded-lg p-3",
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        className="size-8"
      >
        {isPlaying ? (
          <PauseIcon className="size-4" />
        ) : (
          <PlayIcon className="size-4" />
        )}
      </Button>

      <div className="flex-1">
        <div className="bg-muted-foreground/20 h-1 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <span className="text-muted-foreground min-w-[40px] text-xs">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <Volume2Icon className="text-muted-foreground size-4" />
    </div>
  );
}
