// English copy fixture every test imports from, so string assertions live in
// one place. PR 2 replaces this with a re-export of `@/i18n/en`.

export const GREETING = "Hello, I'm BT Servant. How can I serve you today?";
export const PLACEHOLDER = "How can I help you today?";
export const DISCLAIMER =
  "BT Servant can make mistakes. Please double-check responses.";

export const CHIPS = [
  {
    label: "Help me translate John 3:16",
    prompt: "Help me translate John 3:16",
  },
  { label: "Summarize Gen 1:1-5", prompt: "Can you summarize Genesis 1:1-5?" },
  { label: "Tell me about Amos", prompt: "Tell me about Amos in the Bible" },
];

export const VOICE_MESSAGE_LABEL = "Voice message";
export const SHOW_TRANSCRIPT = "Show transcript";

export const CONNECTING = "Connecting...";
export const CONNECTION_LOST = "Connection lost. Please try again.";
export const FALLBACK_ERROR =
  "Sorry, I encountered an error. Please try again.";

export const GLOBAL_ERROR_HEADING = "Something went wrong.";
export const GLOBAL_ERROR_RETRY = "Try again";

export const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
