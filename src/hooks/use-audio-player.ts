"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  play: (base64Audio: string, format?: string) => void;
  playUrl: (url: string) => void;
  load: (src: string) => void;
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

  // Create and wire up an Audio element for a given source without playing
  const setupAudio = useCallback((src: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio();
    audioRef.current = audio;
    currentSrcRef.current = src;
    audio.preload = "auto";
    audio.src = src;

    // TTS-generated MP3s often lack duration in metadata. The browser resolves
    // duration progressively as it downloads/decodes. We check on every event
    // that might update it: durationchange, timeupdate, and loadeddata.
    const updateDuration = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    audio.ondurationchange = updateDuration;
    audio.onloadeddata = updateDuration;

    audio.ontimeupdate = () => {
      updateDuration();
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

    return audio;
  }, []);

  // Pre-load a source without playing — call on mount so audio is ready for first click
  const load = useCallback(
    (src: string) => {
      if (audioRef.current && currentSrcRef.current === src) return;
      setupAudio(src);
    },
    [setupAudio]
  );

  // Play a source — resumes if already loaded, otherwise creates and plays
  const startAudio = useCallback(
    (src: string) => {
      if (audioRef.current && currentSrcRef.current === src) {
        audioRef.current.play().catch((error) => {
          console.error("Failed to play audio:", error);
        });
        return;
      }

      const audio = setupAudio(src);
      audio.play().catch((error) => {
        console.error("Failed to play audio:", error);
      });
    },
    [setupAudio]
  );

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
    if (audioRef.current && isFinite(time)) {
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
    load,
    pause,
    stop,
    seek,
  };
}
