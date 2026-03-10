# Streaming Animation System

This document describes how the streaming text animation works, the bugs it has
had, and the invariants that must be preserved. **Read this before modifying any
streaming or animation code.**

## Architecture Overview

The streaming flow has three phases:

1. **Streaming phase** — The poll loop receives `progress` events and appends
   each chunk to `streamingText` state. The `allMessages` memo appends a
   synthetic streaming message (id=`"streaming"`, `isStreaming: true`) to the
   message list. `AssistantMessage` renders this via `AnimatedText`, which
   reveals text character-by-character using `useAnimatedText`.

2. **Completing phase** — A `complete` event arrives with the final response as
   `data.responses` (an array). `handleComplete` joins them with `"\n\n"`,
   replaces `streamingText` with the joined string, stores the permanent message
   in `pendingCompleteRef`, and sets `isCompleting = true`. `AnimatedText`
   continues revealing until it catches up to the full text length.

3. **Finalize phase** — When the animation catches up (`isAnimationDone`),
   `finalizeComplete` is called. It adds the permanent message to `messages`,
   clears `streamingText`, and resets loading state. The synthetic streaming
   message disappears, replaced by the permanent message rendered with
   `MessagePrimitive.Parts` / `MarkdownText`.

## Key Files

| File                                     | What it does                                                         |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `src/hooks/use-chat-runtime.ts`          | Streaming state, poll loop, `handleComplete`, `finalizeComplete`     |
| `src/components/assistant-ui/thread.tsx` | `useAnimatedText` hook, `AnimatedText` component, `AssistantMessage` |

## Critical Invariants

### 1. Divergence guard must snap to end, NEVER reset to zero

In `useAnimatedText`, when the text prop changes and the new text does not
start with the previously-displayed prefix, the hook must set
`displayedLength` to `text.length` (snap to end).

**DO NOT set it to `0`.** Setting it to zero causes the entire response to
re-animate from the first character, making it appear as though the stream
restarts from the beginning. This is the single most reported user-facing bug
in this codebase and has been fixed twice.

The divergence happens because `handleComplete` replaces the incrementally
accumulated `streamingText` with `data.responses.join("\n\n")`. Minor
differences (whitespace, joining boundaries) between the accumulated chunks
and the joined final response can cause a prefix mismatch.

### 2. Progress events must be ignored after a terminal event

In the poll loop, once a `complete` or `error` event has been processed,
subsequent `progress` events in the same or later poll batches must be
discarded. Without this guard, straggling chunks append to `streamingText`
after `handleComplete` has already set it to the final joined response,
creating the text divergence described above.

### 3. Streaming markdown components must match final markdown components

The `streamingMarkdownComponents` in `thread.tsx` must stay in sync with the
`defaultComponents` in `markdown-text.tsx`. If they diverge, the swap from
`AnimatedText` to `MessagePrimitive.Parts` at finalize time will cause a
visible layout jump as headings, lists, code blocks, etc. render with
different styles.

## Bug History

| Version | Commit    | What happened                                                                                                                                                            |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1.3.1  | `4c1a5dd` | Fixed the replay bug by removing the divergence guard entirely — only reset on `text.length === 0`. Also added matching markdown components for seamless swap.           |
| v1.3.1  | `7cfefe7` | Code review re-added the divergence guard with `setDisplayedLength(0)` to prevent garbled text. This inadvertently reintroduced the replay bug.                          |
| v1.3.1  | `ab965f7` | Removed `requestAnimationFrame` from `finalizeComplete` to fix a race condition with quick follow-up messages.                                                           |
| v1.3.2  | PR #10    | Fixed replay bug again: changed divergence guard to `setDisplayedLength(text.length)` (snap to end). Added `handledTerminal` guard to ignore straggling progress events. |
