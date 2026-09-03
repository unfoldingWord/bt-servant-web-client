import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantProvider } from "@/components/providers/assistant-provider";
import { UserMenu } from "@/components/user-menu";
import { LocaleProvider } from "@/i18n";
import { VOICE_MESSAGE_SENTINEL } from "@/lib/voice-message";
import type { ChatHistoryEntry, UserPreferences } from "@/types/engine";
import { consoleSpy } from "@/test/console";
import {
  chipsFor,
  LOCALES,
  SUPPORTED_LOCALES,
  toResponseLanguage,
  type Locale,
} from "@/test/copy";
import { installFakeBff, PREFERENCES_ROUTE } from "@/test/fake-bff";
import { completeEvent } from "@/test/fixtures";
import { stubNavigatorLanguage } from "@/test/navigator";
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

// The thread is rendered through the real LocaleProvider and the real
// AssistantProvider (real useChatRuntime + real @assistant-ui/react runtime).
// Only `fetch` and `navigator.language` are stubbed: history fixtures
// populate the thread; the stream endpoint records the outbound body and, by
// default, answers with a single `complete` event; the locale is seeded the
// way the app seeds it, from navigator.language on mount. Every suite runs
// once per supported locale, reading its copy from that locale's dictionary.

const ENGINE_REPLY = "Reply from the engine.";
const AUDIO_ROUTE = "/api/audio";
const WAIT = { interval: 5 };

// Unmount (and close any stream still open) inside act, under the clock the
// test left installed, before the setup file restores the console spies.
// See src/test/timers.ts.
afterEach(teardownMounted);

async function renderThread({
  historyEntries = [],
  liveStream = false,
  locale = "en",
  withUserMenu = false,
  storedPreferences,
  deferPreferences = false,
}: {
  historyEntries?: ChatHistoryEntry[];
  /** Leave the stream open for the test to push events into. */
  liveStream?: boolean;
  /** Seeded through navigator.language, as in the browser. */
  locale?: Locale;
  /** Also render the header's UserMenu (the language picker) next to the thread. */
  withUserMenu?: boolean;
  /** What the worker has stored for this user; default nothing. */
  storedPreferences?: UserPreferences;
  /**
   * Leave `GET /api/preferences` unanswered until the test calls the returned
   * `answerPreferences`; the mount-time load is then still in flight.
   */
  deferPreferences?: boolean;
} = {}) {
  stubNavigatorLanguage(locale);
  let answerPreferences!: (body: UserPreferences) => void;
  const harness = installFakeBff({
    historyEntries,
    storedPreferences,
    onStream: liveStream
      ? undefined
      : () => sseResponse([completeEvent([ENGINE_REPLY])]),
    extraRoutes: {
      ...(deferPreferences && {
        [PREFERENCES_ROUTE]: () =>
          new Promise<Response>((resolve) => {
            answerPreferences = (body) =>
              resolve(
                new Response(JSON.stringify(body), {
                  headers: { "Content-Type": "application/json" },
                })
              );
          }),
      }),
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
    <LocaleProvider>
      <AssistantProvider>
        {withUserMenu && <UserMenu userInitial="S" />}
        <Thread />
      </AssistantProvider>
    </LocaleProvider>
  );
  trackMount({ unmount, streams: harness.streams });
  // The first paint is always the empty state (messages start as []). Wait
  // for history to be applied so the branch under test is the one the user
  // would actually see; for a non-empty thread that is the greeting leaving.
  // The provider also reads the stored preference on mount; wait for that
  // too so a stored locale has been applied before any assertion.
  await harness.historyLoaded();
  if (!deferPreferences) await harness.preferencesLoaded();
  if (historyEntries.length > 0) {
    const greeting = LOCALES[locale].dictionary["thread.welcome"];
    await waitFor(() =>
      expect(screen.queryByText(greeting)).not.toBeInTheDocument()
    );
  }
  return { ...harness, answerPreferences };
}

describe.each(SUPPORTED_LOCALES)("Thread [%s]", (locale) => {
  const dict = LOCALES[locale].dictionary;
  const GREETING = dict["thread.welcome"];
  const PLACEHOLDER = dict["composer.placeholder"];
  const DISCLAIMER = dict["thread.disclaimer"];
  const CHIPS = chipsFor(dict);
  const otherLocales = SUPPORTED_LOCALES.filter((l) => l !== locale);

  describe("empty state", () => {
    it("renders the greeting, exactly three suggestion chips and the composer placeholder in this locale only", async () => {
      await renderThread({ locale });

      expect(screen.getByText(GREETING)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
      // Icon-only send button: its accessible name is dictionary-backed.
      expect(
        screen.getByRole("button", { name: dict["composer.send"] })
      ).toBeInTheDocument();
      expect(document.documentElement.lang).toBe(locale);

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

      for (const other of otherLocales) {
        const otherDict = LOCALES[other].dictionary;
        expect(
          screen.queryByText(otherDict["thread.welcome"])
        ).not.toBeInTheDocument();
        expect(
          screen.queryByPlaceholderText(otherDict["composer.placeholder"])
        ).not.toBeInTheDocument();
      }
    });

    // Premise for the it.each below: at least one chip's prompt differs from
    // its label, otherwise "sends its prompt, not its label" proves nothing.
    it("fixture: at least one chip has a prompt that differs from its label", () => {
      expect(CHIPS.some((c) => c.prompt !== c.label)).toBe(true);
    });

    it.each(CHIPS)(
      "clicking $label sends its prompt ($prompt), not its label",
      async (chip) => {
        const { streamBodies } = await renderThread({ locale });
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

  describe("streaming", () => {
    // docs/streaming-animation.md invariant #1: when the `complete` text is not
    // a continuation of what has already been revealed, the reveal snaps to the
    // end of the new text. It must never restart from character 0.
    it("snaps a diverging complete to the end of the text (never back to character 0) and finalizes through AnimatedText", async () => {
      const harness = await renderThread({ liveStream: true, locale });

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

    // The runtime hook stores keys, not copy (it is locale-agnostic); these
    // two cases prove the thread turns them into this locale's strings.
    it("shows the connecting status, then the worker's status text as-is, then the connection-lost copy when the stream dies", async () => {
      const harness = await renderThread({ liveStream: true, locale });

      vi.useFakeTimers();
      fireEvent.click(screen.getByRole("button", { name: CHIPS[0].label }));
      await flush();
      const stream = harness.streams[0];

      expect(screen.getByText(dict["status.connecting"])).toBeInTheDocument();

      await pushAndFlush(stream, {
        type: "status",
        message: "Looking up Amos",
      });
      expect(screen.getByText("Looking up Amos")).toBeInTheDocument();
      expect(
        screen.queryByText(dict["status.connecting"])
      ).not.toBeInTheDocument();

      await closeAndFlush(stream);
      expect(
        screen.getByText(dict["error.connectionLost"])
      ).toBeInTheDocument();
      expect(screen.queryByText("Looking up Amos")).not.toBeInTheDocument();
    });

    it("renders the canned error copy for an error event, never the raw worker text", async () => {
      const harness = await renderThread({ liveStream: true, locale });

      vi.useFakeTimers();
      fireEvent.click(screen.getByRole("button", { name: CHIPS[0].label }));
      await flush();
      const stream = harness.streams[0];

      const rawWorkerError =
        '{"error":{"type":"overloaded_error","message":"Overloaded"}}';
      await pushAndFlush(stream, { type: "error", error: rawWorkerError });

      expect(screen.getByText(dict["error.generic"])).toBeInTheDocument();
      expect(screen.queryByText(/overloaded_error/)).not.toBeInTheDocument();
      for (const other of otherLocales) {
        expect(
          screen.queryByText(LOCALES[other].dictionary["error.generic"])
        ).not.toBeInTheDocument();
      }

      await closeAndFlush(stream);
    });
  });

  describe("language preference", () => {
    const other = SUPPORTED_LOCALES.find((l) => l !== locale)!;
    const otherDict = LOCALES[other].dictionary;

    it(`a stored preference for ${other} wins over the browser's ${locale} on load`, async () => {
      const harness = await renderThread({
        locale,
        storedPreferences: {
          response_language: toResponseLanguage(other),
        },
      });

      await waitFor(
        () =>
          expect(
            screen.getByText(otherDict["thread.welcome"])
          ).toBeInTheDocument(),
        WAIT
      );
      expect(screen.queryByText(GREETING)).not.toBeInTheDocument();
      expect(document.documentElement.lang).toBe(other);
      expect(harness.preferencePuts).toEqual([]);
    });

    it(`picking ${LOCALES[other].displayName} in the user menu PUTs the preference and re-renders the whole thread in ${other} without a reload`, async () => {
      const harness = await renderThread({ locale, withUserMenu: true });
      const user = userEvent.setup();

      await user.click(
        screen.getByRole("button", { name: dict["userMenu.trigger"] })
      );
      await user.click(
        screen.getByRole("menuitemradio", {
          name: LOCALES[other].displayName,
        })
      );

      await waitFor(
        () =>
          expect(
            screen.getByText(otherDict["thread.welcome"])
          ).toBeInTheDocument(),
        WAIT
      );
      expect(harness.preferencePuts.at(-1)).toEqual({
        response_language: toResponseLanguage(other),
      });
      expect(
        screen.getByPlaceholderText(otherDict["composer.placeholder"])
      ).toBeInTheDocument();
      for (const chip of chipsFor(otherDict)) {
        expect(
          screen.getByRole("button", { name: chip.label })
        ).toBeInTheDocument();
      }
      expect(screen.queryByText(GREETING)).not.toBeInTheDocument();
      expect(document.documentElement.lang).toBe(other);
      // Picking a language is not a message.
      expect(harness.streamBodies).toEqual([]);
    });

    // Regression: the locale must never flip under an animating reply, even
    // when the mount-time load settles mid-stream: the loaded value is held
    // and applied once the reply has landed.
    it(`a stored ${other} that loads while a reply streams is applied only after the reply lands`, async () => {
      const harness = await renderThread({
        locale,
        liveStream: true,
        deferPreferences: true,
      });
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: CHIPS[0].label }));
      await waitFor(() => expect(harness.streams).toHaveLength(1), WAIT);

      harness.answerPreferences({
        response_language: toResponseLanguage(other),
      });
      await harness.preferencesLoaded();
      await act(async () => {});

      // Mid-stream: still this locale.
      expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
      expect(document.documentElement.lang).toBe(locale);

      const stream = harness.streams[0];
      stream.push(completeEvent([ENGINE_REPLY]));
      stream.close();
      await screen.findByText(ENGINE_REPLY);

      // The reply has landed: the held preference applies.
      await waitFor(
        () =>
          expect(
            screen.getByPlaceholderText(otherDict["composer.placeholder"])
          ).toBeInTheDocument(),
        WAIT
      );
      expect(document.documentElement.lang).toBe(other);
      expect(harness.preferencePuts).toEqual([]);
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    // Regression: the locale must never flip under an animating reply. The
    // picker locks itself while a reply is in flight and unlocks when the
    // reply has landed.
    it("locks the language picker with a hint while a reply streams and unlocks it once the reply lands", async () => {
      const harness = await renderThread({
        locale,
        liveStream: true,
        withUserMenu: true,
        // A returning user: the load applies the stored value and seeds
        // nothing, so any PUT below would be the picker's.
        storedPreferences: { response_language: toResponseLanguage(locale) },
      });
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: CHIPS[0].label }));
      await waitFor(() => expect(harness.streams).toHaveLength(1), WAIT);

      await user.click(
        screen.getByRole("button", { name: dict["userMenu.trigger"] })
      );
      await screen.findByRole("menu");
      expect(
        screen.getByText(dict["userMenu.languageLockedWhileReplying"])
      ).toBeInTheDocument();
      for (const item of screen.getAllByRole("menuitemradio")) {
        expect(item).toHaveAttribute("aria-disabled", "true");
      }
      // A click on a locked item changes nothing.
      await user.click(
        screen.getByRole("menuitemradio", {
          name: LOCALES[other].displayName,
        })
      );
      expect(harness.preferencePuts).toEqual([]);
      expect(document.documentElement.lang).toBe(locale);

      // The reply lands and finalizes; the same open menu unlocks.
      const stream = harness.streams[0];
      stream.push(completeEvent([ENGINE_REPLY]));
      stream.close();
      await waitFor(
        () =>
          expect(
            screen.queryByText(dict["userMenu.languageLockedWhileReplying"])
          ).not.toBeInTheDocument(),
        WAIT
      );
      for (const item of screen.getAllByRole("menuitemradio")) {
        expect(item).not.toHaveAttribute("aria-disabled");
      }
    });
  });

  describe("with messages", () => {
    const textHistory: ChatHistoryEntry[] = [
      {
        user_message: "Who was Amos?",
        assistant_response: "Amos was a shepherd from Tekoa.",
        created_at: "2026-09-01T12:00:00Z",
      },
    ];

    it("renders the composer placeholder and the disclaimer under the last assistant message", async () => {
      await renderThread({ historyEntries: textHistory, locale });

      expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
      expect(screen.getByText("Who was Amos?")).toBeInTheDocument();
      expect(
        screen.getByText("Amos was a shepherd from Tekoa.")
      ).toBeInTheDocument();
      expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
      expect(screen.queryByText(GREETING)).not.toBeInTheDocument();
      // Icon-only copy button on the last assistant message.
      expect(
        screen.getByRole("button", { name: dict["message.copy"] })
      ).toBeInTheDocument();
    });

    // Data, not copy: the persisted sentinel is compared by equality and so
    // is recognised as a voice turn in every locale; only the label changes.
    it("renders a [Voice message] user turn as the localized voice label, never the raw sentinel", async () => {
      await renderThread({
        historyEntries: [
          {
            user_message: VOICE_MESSAGE_SENTINEL,
            assistant_response: "Here is what I heard.",
            created_at: "2026-09-01T12:00:00Z",
          },
        ],
        locale,
      });

      expect(
        screen.queryByText(VOICE_MESSAGE_SENTINEL)
      ).not.toBeInTheDocument();
      const label = screen.getByText(dict["message.voiceMessage"]);
      // The label is decorated with the mic icon (lucide renders an <svg>).
      expect(label.querySelector("svg")).not.toBeNull();
    });

    it("renders the audio player for an assistant turn that carries voice audio", async () => {
      const harness = await renderThread({
        historyEntries: [
          {
            user_message: VOICE_MESSAGE_SENTINEL,
            assistant_response: "Spoken reply transcript.",
            created_at: "2026-09-01T12:00:00Z",
            voice_audio_url: "https://audio.example/reply.mp3",
          },
        ],
        locale,
      });
      await harness.bodyConsumed(AUDIO_ROUTE);

      // The transcript is collapsed behind a toggle rather than shown inline.
      expect(
        screen.getByRole("button", { name: dict["message.showTranscript"] })
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Spoken reply transcript.")
      ).not.toBeInTheDocument();
    });
  });
});
