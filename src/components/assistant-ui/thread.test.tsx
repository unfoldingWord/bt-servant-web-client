import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantProvider } from "@/components/providers/assistant-provider";
import type { ChatHistoryEntry } from "@/types/engine";
import { consoleSpy } from "@/test/console";
import {
  CHIPS,
  DISCLAIMER,
  GREETING,
  PLACEHOLDER,
  SHOW_TRANSCRIPT,
  VOICE_MESSAGE_LABEL,
} from "@/test/copy";
import { installFakeBff } from "@/test/fake-bff";
import { completeEvent } from "@/test/fixtures";
import { sseResponse } from "@/test/sse";
import {
  advance,
  closeAndFlush,
  flush,
  pushAndFlush,
  teardownMounted,
  trackMount,
} from "@/test/timers";
import { Thread } from "./thread";

// The thread is rendered through the real AssistantProvider (real
// useChatRuntime + real @assistant-ui/react runtime). Only `fetch` is
// stubbed: history fixtures populate the thread; the stream endpoint records
// the outbound body and, by default, answers with a single `complete` event.

// The literal stored for a voice turn with no transcript. Kept local on
// purpose: the test's point is that this literal never reaches the screen.
const VOICE_SENTINEL = "[Voice message]";
const ENGINE_REPLY = "Reply from the engine.";
const AUDIO_ROUTE = "/api/audio";

// Unmount (and close any stream still open) inside act, under the clock the
// test left installed, before the setup file restores the console spies.
// See src/test/timers.ts.
afterEach(teardownMounted);

async function renderThread({
  historyEntries = [],
  liveStream = false,
}: {
  historyEntries?: ChatHistoryEntry[];
  /** Leave the stream open for the test to push events into. */
  liveStream?: boolean;
} = {}) {
  const harness = installFakeBff({
    historyEntries,
    onStream: liveStream
      ? undefined
      : () => sseResponse([completeEvent([ENGINE_REPLY])]),
    extraRoutes: {
      // AudioPlayer fetches the proxied clip and calls res.blob(); audio
      // bytes exercise its happy path (URL.createObjectURL is stubbed in
      // setup). Bytes, not a Blob body: jsdom's Blob has no stream() and
      // Node's Response cannot read it.
      [AUDIO_ROUTE]: () =>
        new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), {
          headers: { "Content-Type": "audio/mpeg" },
        }),
    },
  });
  const { unmount } = render(
    <AssistantProvider>
      <Thread />
    </AssistantProvider>
  );
  trackMount({ unmount, streams: harness.streams });
  // The first paint is always the empty state (messages start as []). Wait
  // for history to be applied so the branch under test is the one the user
  // would actually see; for a non-empty thread that is the greeting leaving.
  await harness.historyLoaded();
  if (historyEntries.length > 0) {
    await waitFor(() =>
      expect(screen.queryByText(GREETING)).not.toBeInTheDocument()
    );
  }
  return harness;
}

describe("Thread — empty state", () => {
  it("renders the greeting, exactly three suggestion chips and the composer placeholder", async () => {
    await renderThread();

    expect(screen.getByText(GREETING)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();

    // Every fixture chip is on screen, and nothing else with the button role
    // but the composer's send button: jsdom has no MediaRecorder, so the
    // voice button is not rendered. Counting all buttons (not the chips we
    // looked up by name) is what makes a fourth product chip fail.
    for (const chip of CHIPS) {
      expect(
        screen.getByRole("button", { name: chip.label })
      ).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button")).toHaveLength(CHIPS.length + 1);
  });

  // Premise for the it.each below: at least one chip's prompt differs from
  // its label, otherwise "sends its prompt, not its label" proves nothing.
  it("fixture: at least one chip has a prompt that differs from its label", () => {
    expect(CHIPS.some((c) => c.prompt !== c.label)).toBe(true);
  });

  it.each(CHIPS)(
    "clicking $label sends its prompt ($prompt), not its label",
    async (chip) => {
      const { streamBodies } = await renderThread();
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: chip.label }));

      await waitFor(() => expect(streamBodies).toHaveLength(1));
      expect(streamBodies[0].message).toBe(chip.prompt);
      expect(streamBodies[0].message_type).toBe("text");

      // The prompt (not the label) is what appears as the user's bubble, and
      // the engine reply lands in the thread.
      expect(await screen.findByText(chip.prompt)).toBeInTheDocument();
      expect(await screen.findByText(ENGINE_REPLY)).toBeInTheDocument();
      expect(screen.queryByText(GREETING)).not.toBeInTheDocument();
    }
  );
});

describe("Thread — streaming animation", () => {
  // docs/streaming-animation.md invariant #1: when the `complete` text is not
  // a continuation of what has already been revealed, the reveal snaps to the
  // end of the new text. It must never restart from character 0.
  it("snaps a diverging complete to the end of the text (never back to character 0) and finalizes through AnimatedText", async () => {
    const harness = await renderThread({ liveStream: true });

    // From here the clock is frozen so the 16ms reveal ticks are explicit.
    // fireEvent, not userEvent: user-event's async wrapper waits on a real
    // setTimeout(0) that the fake clock never fires.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: CHIPS[0].label }));
    await flush();
    const stream = harness.streams[0];
    expect(stream).toBeDefined();

    await pushAndFlush(stream, { type: "progress", text: "Amos was " });
    await pushAndFlush(stream, { type: "progress", text: "a shepherd" });
    // The first chunk is shown whole on mount; two ticks reveal 2 chars each.
    await advance(2 * 16);
    expect(screen.getByText("Amos was a sh")).toBeInTheDocument();

    const finalText = "Amos, a shepherd from Tekoa.";
    expect(finalText.startsWith("Amos was a sh")).toBe(false); // premise
    await pushAndFlush(stream, completeEvent([finalText]));

    // No further tick has run: the whole final text is already visible.
    expect(screen.getByText(finalText)).toBeInTheDocument();
    // The animation reported itself caught up, which is what calls
    // finalizeComplete (the test never does); the permanent message renders
    // with its disclaimer once the run is over.
    expect(consoleSpy.log).toHaveBeenCalledWith(
      "[AnimatedText] animation caught up, calling finalizeComplete"
    );
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();

    await closeAndFlush(stream);
  });
});

describe("Thread — with messages", () => {
  const textHistory: ChatHistoryEntry[] = [
    {
      user_message: "Who was Amos?",
      assistant_response: "Amos was a shepherd from Tekoa.",
      created_at: "2026-09-01T12:00:00Z",
    },
  ];

  it("renders the composer placeholder and the disclaimer under the last assistant message", async () => {
    await renderThread({ historyEntries: textHistory });

    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
    expect(screen.getByText("Who was Amos?")).toBeInTheDocument();
    expect(
      screen.getByText("Amos was a shepherd from Tekoa.")
    ).toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
    expect(screen.queryByText(GREETING)).not.toBeInTheDocument();
  });

  it("renders a [Voice message] user turn as the 'Voice message' label, never the raw sentinel", async () => {
    await renderThread({
      historyEntries: [
        {
          user_message: VOICE_SENTINEL,
          assistant_response: "Here is what I heard.",
          created_at: "2026-09-01T12:00:00Z",
        },
      ],
    });

    expect(screen.queryByText(VOICE_SENTINEL)).not.toBeInTheDocument();
    expect(screen.getByText(VOICE_MESSAGE_LABEL)).toBeInTheDocument();
  });

  it("renders the audio player for an assistant turn that carries voice audio", async () => {
    const harness = await renderThread({
      historyEntries: [
        {
          user_message: VOICE_SENTINEL,
          assistant_response: "Spoken reply transcript.",
          created_at: "2026-09-01T12:00:00Z",
          voice_audio_url: "https://audio.example/reply.mp3",
        },
      ],
    });
    await harness.bodyConsumed(AUDIO_ROUTE);

    // The transcript is collapsed behind a toggle rather than shown inline.
    expect(
      screen.getByRole("button", { name: SHOW_TRANSCRIPT })
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Spoken reply transcript.")
    ).not.toBeInTheDocument();
  });
});
