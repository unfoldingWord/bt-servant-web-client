"use client";

import { Button } from "@/components/ui/button";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { PauseIcon, PlayIcon, Volume2Icon } from "lucide-react";
import { useEffect, useRef } from "react";
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
  const { isPlaying, currentTime, duration, play, pause, seek } =
    useAudioPlayer();
  const progressRef = useRef<HTMLDivElement>(null);

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

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || duration === 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    seek(Math.max(0, Math.min(newTime, duration)));
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
        "flex items-center gap-3 rounded-lg border border-[#00000010] bg-[#f5f5f0] p-3 dark:border-[#6c6a6040] dark:bg-[#393937]",
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        className="size-8 text-[#6b6a68] hover:bg-[#e5e5dd] hover:text-[#1a1a18] dark:text-[#9a9893] dark:hover:bg-[#4a4a47] dark:hover:text-[#eee]"
      >
        {isPlaying ? (
          <PauseIcon className="size-4" />
        ) : (
          <PlayIcon className="size-4" />
        )}
      </Button>

      <div
        ref={progressRef}
        className="flex-1 cursor-pointer py-2"
        onClick={handleProgressClick}
      >
        <div className="h-1.5 overflow-hidden rounded-full bg-[#DDD9CE] dark:bg-[#4a4a47]">
          <div
            className="h-full rounded-full bg-[#ae5630] transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <span className="min-w-[40px] font-sans text-xs text-[#6b6a68] dark:text-[#9a9893]">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <Volume2Icon className="size-4 text-[#6b6a68] dark:text-[#9a9893]" />
    </div>
  );
}
