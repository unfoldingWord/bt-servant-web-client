"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  play: (base64Audio: string, format?: string) => void;
  playUrl: (url: string) => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentSrcRef = useRef<string | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const startAudio = useCallback((src: string) => {
    // Resume if same source is paused
    if (audioRef.current && currentSrcRef.current === src) {
      audioRef.current.play().catch((error) => {
        console.error("Failed to play audio:", error);
      });
      return;
    }

    // Stop any existing playback
    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio();
    audioRef.current = audio;
    currentSrcRef.current = src;
    audio.src = src;

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

    audio.play().catch((error) => {
      console.error("Failed to play audio:", error);
    });
  }, []);

  const play = useCallback(
    (base64Audio: string, format: string = "mp3") => {
      const mimeType =
        format === "mp3"
          ? "audio/mpeg"
          : format === "ogg"
            ? "audio/ogg"
            : format === "webm"
              ? "audio/webm"
              : "audio/mpeg";
      startAudio(`data:${mimeType};base64,${base64Audio}`);
    },
    [startAudio]
  );

  const playUrl = useCallback(
    (url: string) => {
      startAudio(url);
    },
    [startAudio]
  );

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
    playUrl,
    pause,
    stop,
    seek,
  };
}
