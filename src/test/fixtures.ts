import type { SSEEvent } from "@/types/engine";

/** A `complete` event carrying text responses and no voice audio. */
export function completeEvent(responses: string[]): SSEEvent {
  return {
    type: "complete",
    response: { responses, response_language: "en", voice_audio_base64: null },
  };
}
