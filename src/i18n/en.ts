/**
 * English — the typed source of truth for every user-facing interface string.
 *
 * Keys are semantic (`thread.welcome`), never the English text. Every other
 * locale file must `satisfies Record<MessageKey, string>` so a missing key
 * fails `tsc`; `src/i18n/i18n.test.ts` enforces runtime parity as well.
 *
 * `{param}` placeholders are interpolated by `t()`.
 *
 * Never add these here — they are data, not copy:
 *   - the `"[Voice message]"` sentinel (persisted in history, compared by
 *     equality in `use-chat-runtime.ts` and `thread.tsx`)
 *   - the SSE status keyword heuristic (`includes("audio" | "tts" | "speech")`)
 *     in `use-chat-runtime.ts`
 */
export const en = {
  // Chat thread
  "thread.welcome": "Hello, I'm BT Servant. How can I serve you today?",
  "thread.disclaimer":
    "BT Servant can make mistakes. Please double-check responses.",
  "thread.thinking": "Thinking...",
  "thread.scrollToBottom": "Scroll to bottom",

  // Suggestion chips. `label` is what the user sees; `prompt` is what is sent
  // to the model. They are separate keys on purpose: the prompt must be
  // idiomatic model input in each language, not a translation of the label.
  "thread.suggestion.translate.label": "Help me translate John 3:16",
  "thread.suggestion.translate.prompt": "Help me translate John 3:16",
  "thread.suggestion.summarize.label": "Summarize Gen 1:1-5",
  "thread.suggestion.summarize.prompt": "Can you summarize Genesis 1:1-5?",
  "thread.suggestion.amos.label": "Tell me about Amos",
  "thread.suggestion.amos.prompt": "Tell me about Amos in the Bible",

  // Composer
  "composer.placeholder": "How can I help you today?",
  "composer.voiceButton": "Voice message",

  // Messages
  "message.voiceMessage": "Voice message",
  "message.showTranscript": "Show transcript",
  "message.hideTranscript": "Hide transcript",
  "message.deliveryFailed":
    "Sorry, I couldn't deliver a response. Please try again.",
  "message.copyCode": "Copy",

  // Streaming status and runtime errors (used from non-React code via `t()`)
  "status.connecting": "Connecting...",
  "error.connectionLost": "Connection lost. Please try again.",
  "error.generic": "Sorry, I encountered an error. Please try again.",
  "error.timeout":
    "Sorry, that took too long and the response was cut off. Please try again.",

  // Voice recorder
  "recorder.recording": "Recording...",
  "recorder.starting": "Starting...",

  // User menu
  "userMenu.aria": "User menu",
  "userMenu.signOut": "Sign out",
  "userMenu.signOutDescription": "End your current session",

  // Login page
  "login.headline": "Translate God's word even better.",
  "login.subheadline":
    "Conversational interface to curated translation resources",
  "login.continueWithGoogle": "Continue with Google",
  "login.signingIn": "Signing in...",

  // Global error boundary (rendered without a LocaleProvider; always default locale)
  "globalError.heading": "Something went wrong.",
  "globalError.retry": "Try again",
} as const;

export type MessageKey = keyof typeof en;
