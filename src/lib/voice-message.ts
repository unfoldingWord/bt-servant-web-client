/**
 * The user-message text stored for a voice turn that has no transcript.
 *
 * Data, not copy: it is persisted in chat history by the worker and compared
 * by equality (`use-chat-runtime.ts` writes it, `thread.tsx` recognises it),
 * so it must never be localized or reworded. The label the user sees is the
 * dictionary key `message.voiceMessage`. See docs/i18n.md, "Never translate".
 */
export const VOICE_MESSAGE_SENTINEL = "[Voice message]";
