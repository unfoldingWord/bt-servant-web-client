"use client";

import { Button } from "@/components/ui/button";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { PauseIcon, PlayIcon, Volume2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  audioBase64?: string;
  audioUrl?: string;
  format?: string;
  autoPlay?: boolean;
  className?: string;
}

export function AudioPlayer({
  audioBase64,
  audioUrl,
  format = "mp3",
  autoPlay = false,
  className,
}: AudioPlayerProps) {
  const { isPlaying, currentTime, duration, play, playUrl, load, pause, seek } =
    useAudioPlayer();
  const progressRef = useRef<HTMLDivElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // For base64 sources, compute the data URI directly
  const dataUri = useMemo(() => {
    if (audioBase64) {
      const mimeType =
        format === "mp3"
          ? "audio/mpeg"
          : format === "ogg"
            ? "audio/ogg"
            : format === "webm"
              ? "audio/webm"
              : "audio/mpeg";
      return `data:${mimeType};base64,${audioBase64}`;
    }
    return null;
  }, [audioBase64, format]);

  // For URL sources, fetch as blob so the browser has the complete data
  // and can determine duration from the audio container metadata
  useEffect(() => {
    if (!audioUrl) return;

    let revoked = false;

    fetch(audioUrl, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`Audio fetch failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (revoked) return;
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch((err) => {
        console.error("Failed to fetch audio blob:", err);
      });

    return () => {
      revoked = true;
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [audioUrl]);

  // The resolved source: blob URL (for proxy URLs), data URI (for base64), or null
  const audioSrc = blobUrl || dataUri;

  // Pre-load audio element once source is ready
  useEffect(() => {
    if (audioSrc) {
      load(audioSrc);
    }
  }, [audioSrc, load]);

  // Auto-play if requested
  useEffect(() => {
    if (autoPlay && audioSrc) {
      playUrl(audioSrc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, audioSrc]);

  const handleToggle = () => {
    if (isPlaying) {
      pause();
    } else if (audioSrc) {
      playUrl(audioSrc);
    }
  };

  const hasDuration = duration > 0 && isFinite(duration);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !hasDuration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    seek(Math.max(0, Math.min(newTime, duration)));
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = hasDuration ? (currentTime / duration) * 100 : 0;

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
        className={cn(
          "flex-1 py-2",
          hasDuration ? "cursor-pointer" : "cursor-default"
        )}
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
        {hasDuration
          ? `${formatTime(currentTime)} / ${formatTime(duration)}`
          : formatTime(currentTime)}
      </span>

      <Volume2Icon className="size-4 text-[#6b6a68] dark:text-[#9a9893]" />
    </div>
  );
}
