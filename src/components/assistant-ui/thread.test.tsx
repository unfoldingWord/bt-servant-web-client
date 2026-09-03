import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantProvider } from "@/components/providers/assistant-provider";
import type { ChatHistoryEntry, SSEEvent } from "@/types/engine";
import { Thread } from "./thread";

// The thread is rendered through the real AssistantProvider (real
// useChatRuntime + real @assistant-ui/react runtime). Only `fetch` is
// stubbed: history fixtures populate the thread; the stream endpoint records
// the outbound body and answers with a single `complete` event.

interface FetchHarness {
  fetchMock: ReturnType<typeof vi.fn>;
  streamBodies: Array<Record<string, unknown>>;
}

function sseResponse(events: SSEEvent[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function installFetch(historyEntries: ChatHistoryEntry[] = []): FetchHarness {
  const streamBodies: Array<Record<string, unknown>> = [];

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/chat/history") {
        return new Response(JSON.stringify({ entries: historyEntries }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.startsWith("/api/audio?")) {
        // AudioPlayer fetches the proxied clip as a blob; a 404 exercises its
        // error path without needing URL.createObjectURL (absent in jsdom).
        return new Response(null, { status: 404 });
      }

      if (url === "/api/chat/stream") {
        streamBodies.push(JSON.parse(String(init?.body)));
        return sseResponse([
          {
            type: "complete",
            response: {
              responses: ["Reply from the engine."],
              response_language: "en",
              voice_audio_base64: null,
            },
          },
        ]);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }
  );

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, streamBodies };
}

async function renderThread(historyEntries: ChatHistoryEntry[] = []) {
  const harness = installFetch(historyEntries);
  const utils = render(
    <AssistantProvider>
      <Thread />
    </AssistantProvider>
  );
  // Let the mount-time history load settle so the empty/non-empty branch is
  // the one the user would actually see.
  await waitFor(() =>
    expect(harness.fetchMock).toHaveBeenCalledWith(
      "/api/chat/history",
      expect.anything()
    )
  );
  // The first paint is always the empty state (messages start as []); once
  // history is applied the greeting disappears for a non-empty thread.
  if (historyEntries.length > 0) {
    await waitFor(() =>
      expect(screen.queryByText(GREETING)).not.toBeInTheDocument()
    );
  } else {
    await screen.findByText(GREETING);
  }
  return { ...utils, ...harness };
}

const GREETING = "Hello, I'm BT Servant. How can I serve you today?";
const PLACEHOLDER = "How can I help you today?";
const DISCLAIMER =
  "BT Servant can make mistakes. Please double-check responses.";

const CHIPS = [
  {
    label: "Help me translate John 3:16",
    prompt: "Help me translate John 3:16",
  },
  { label: "Summarize Gen 1:1-5", prompt: "Can you summarize Genesis 1:1-5?" },
  { label: "Tell me about Amos", prompt: "Tell me about Amos in the Bible" },
];

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  const reactWarnings = consoleError.mock.calls.filter((args) =>
    args.some(
      (a) =>
        typeof a === "string" &&
        (a.includes("not wrapped in act") || a.startsWith("Warning:"))
    )
  );
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(reactWarnings).toEqual([]);
});

describe("Thread — empty state", () => {
  it("renders the greeting and exactly three suggestion chips", async () => {
    await renderThread();

    expect(screen.getByText(GREETING)).toBeInTheDocument();

    const chips = CHIPS.map((c) =>
      screen.getByRole("button", { name: c.label })
    );
    expect(chips).toHaveLength(3);

    // No other suggestion-like buttons: the only buttons are the 3 chips and
    // the composer send button (voice is hidden: jsdom has no MediaRecorder).
    const allButtons = screen.getAllByRole("button");
    expect(allButtons).toHaveLength(4);
  });

  it("renders the composer placeholder", async () => {
    await renderThread();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
  });

  it("clicking a chip sends its prompt, not its label", async () => {
    const { streamBodies } = await renderThread();
    const user = userEvent.setup();

    const chip = CHIPS[1];
    expect(chip.prompt).not.toBe(chip.label); // premise: they differ

    await user.click(screen.getByRole("button", { name: chip.label }));

    await waitFor(() => expect(streamBodies).toHaveLength(1));
    expect(streamBodies[0].message).toBe(chip.prompt);
    expect(streamBodies[0].message).not.toBe(chip.label);
    expect(streamBodies[0].message_type).toBe("text");

    // The prompt (not the label) is what appears as the user's bubble, and
    // the engine reply lands in the thread.
    expect(await screen.findByText(chip.prompt)).toBeInTheDocument();
    expect(
      await screen.findByText("Reply from the engine.")
    ).toBeInTheDocument();
    expect(screen.queryByText(GREETING)).not.toBeInTheDocument();
  });

  it("the third chip also sends a prompt that differs from its label", async () => {
    const { streamBodies } = await renderThread();
    const user = userEvent.setup();

    const chip = CHIPS[2];
    await user.click(screen.getByRole("button", { name: chip.label }));

    await waitFor(() => expect(streamBodies).toHaveLength(1));
    expect(streamBodies[0].message).toBe(chip.prompt);
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
    await renderThread(textHistory);

    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
    expect(screen.getByText("Who was Amos?")).toBeInTheDocument();
    expect(
      screen.getByText("Amos was a shepherd from Tekoa.")
    ).toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
    expect(screen.queryByText(GREETING)).not.toBeInTheDocument();
  });

  it("renders a [Voice message] user turn as the 'Voice message' label, never the raw sentinel", async () => {
    await renderThread([
      {
        user_message: "[Voice message]",
        assistant_response: "Here is what I heard.",
        created_at: "2026-09-01T12:00:00Z",
      },
    ]);

    expect(screen.queryByText("[Voice message]")).not.toBeInTheDocument();

    const label = screen.getByText("Voice message");
    expect(label).toBeInTheDocument();
    // The label is decorated with the mic icon (lucide renders an <svg>).
    expect(label.querySelector("svg")).not.toBeNull();
  });

  it("renders the audio player for an assistant turn that carries voice audio", async () => {
    await renderThread([
      {
        user_message: "[Voice message]",
        assistant_response: "Spoken reply transcript.",
        created_at: "2026-09-01T12:00:00Z",
        voice_audio_url: "https://audio.example/reply.mp3",
      },
    ]);

    // The audio player renders (time readout) and the transcript is
    // collapsed behind a toggle rather than shown inline.
    expect(screen.getByText("0:00")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show transcript" })
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Spoken reply transcript.")
    ).not.toBeInTheDocument();
  });
});
