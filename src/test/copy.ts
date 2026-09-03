// Copy fixture every UI test imports from. The strings are read from the
// English dictionary rather than duplicated here, so the dictionary stays the
// single source of truth and a wording change fails nowhere but there.
import { en } from "@/i18n/en";

export const GREETING = en["thread.welcome"];
export const PLACEHOLDER = en["composer.placeholder"];
export const DISCLAIMER = en["thread.disclaimer"];

export const CHIPS = [
  {
    label: en["thread.suggestion.translate.label"],
    prompt: en["thread.suggestion.translate.prompt"],
  },
  {
    label: en["thread.suggestion.summarize.label"],
    prompt: en["thread.suggestion.summarize.prompt"],
  },
  {
    label: en["thread.suggestion.amos.label"],
    prompt: en["thread.suggestion.amos.prompt"],
  },
];

export const VOICE_MESSAGE_LABEL = en["message.voiceMessage"];
export const SHOW_TRANSCRIPT = en["message.showTranscript"];

export const CONNECTING = en["status.connecting"];
export const CONNECTION_LOST = en["error.connectionLost"];
export const FALLBACK_ERROR = en["error.generic"];
export const TIMEOUT_ERROR = en["error.timeout"];

export const GLOBAL_ERROR_HEADING = en["globalError.heading"];
export const GLOBAL_ERROR_RETRY = en["globalError.retry"];

// Not copy: unit labels are deliberately left untranslated (docs/i18n.md).
export const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
