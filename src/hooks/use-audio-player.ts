"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  play: (base64Audio: string, format?: string) => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const play = useCallback((base64Audio: string, format: string = "mp3") => {
    // Stop any existing playback
    if (audioRef.current) {
      audioRef.current.pause();
    }

    // Create audio element
    const audio = new Audio();
    audioRef.current = audio;

    // Set source from base64
    const mimeType =
      format === "mp3"
        ? "audio/mpeg"
        : format === "ogg"
          ? "audio/ogg"
          : format === "webm"
            ? "audio/webm"
            : "audio/mpeg";
    audio.src = `data:${mimeType};base64,${base64Audio}`;

    // Event handlers
    audio.onloadedmetadata = () => {
      setDuration(audio.duration);
    };

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.onerror = (e) => {
      console.error("Audio playback error:", e);
      setIsPlaying(false);
    };

    // Start playback
    audio.play().catch((error) => {
      console.error("Failed to play audio:", error);
    });
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    play,
    pause,
    stop,
    seek,
  };
}
