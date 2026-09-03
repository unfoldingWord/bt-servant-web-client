import { expect, vi, type Mock } from "vitest";
import { waitFor } from "@testing-library/react";
import type { ChatHistoryEntry } from "@/types/engine";
import { createSseStream, type SseStream } from "./sse";

// A fetch router standing in for the BFF (`/api/*`). Installed as the global
// `fetch`; the vitest config's `unstubGlobals` removes it after each test.

export type RouteHandler = (
  url: string,
  init?: RequestInit
) => Response | Promise<Response>;

export interface FakeBffOptions {
  /** Entries `GET /api/chat/history` returns. Default: none (empty thread). */
  historyEntries?: ChatHistoryEntry[];
  /**
   * Answers `POST /api/chat/stream`. Default: a controllable SSE stream that
   * is pushed onto `streams` so the test can emit events itself.
   */
  onStream?: RouteHandler;
  /** Further routes keyed by pathname (the query string is ignored). */
  extraRoutes?: Record<string, RouteHandler>;
}

export interface FakeBff {
  fetchMock: Mock<typeof fetch>;
  /** Controllable streams opened by the default stream route, oldest first. */
  streams: SseStream[];
  /** Parsed JSON bodies of every `POST /api/chat/stream`, oldest first. */
  streamBodies: Array<Record<string, unknown>>;
  /**
   * Resolves once the client has consumed the response body for `pathname`
   * (`json()`, `text()` or `blob()`). Any state the client sets in the same
   * promise chain has landed by then, inside a `waitFor` window, so no act()
   * warning is raised. Real timers only.
   */
  bodyConsumed: (pathname: string) => Promise<void>;
  /** `bodyConsumed("/api/chat/history")`: the thread shows the branch the user would see. */
  historyLoaded: () => Promise<void>;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Wraps the body readers so consumption of `response` can be awaited. */
function trackConsumption(response: Response, onConsumed: () => void) {
  for (const method of ["json", "text", "blob"] as const) {
    const read = response[method].bind(response);
    Object.defineProperty(response, method, {
      value: async () => {
        const body = await read();
        onConsumed();
        return body;
      },
    });
  }
  return response;
}

export function installFakeBff(opts: FakeBffOptions = {}): FakeBff {
  const streams: SseStream[] = [];
  const streamBodies: Array<Record<string, unknown>> = [];
  const consumed = new Set<string>();

  const routes: Record<string, RouteHandler> = {
    "/api/chat/history": () => json({ entries: opts.historyEntries ?? [] }),
    "/api/chat/stream": (url, init) => {
      streamBodies.push(JSON.parse(String(init?.body)));
      if (opts.onStream) return opts.onStream(url, init);
      const stream = createSseStream(init?.signal ?? null);
      streams.push(stream);
      return stream.response;
    },
    "/api/preferences": () => json({}),
    ...opts.extraRoutes,
  };

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const { pathname } = new URL(url, "http://localhost");
    const route = routes[pathname];
    if (!route) throw new Error(`Unexpected fetch: ${url}`);
    return trackConsumption(await route(url, init), () =>
      consumed.add(pathname)
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  const bodyConsumed = (pathname: string) =>
    waitFor(() => expect(consumed.has(pathname)).toBe(true), {
      interval: 5,
    });

  return {
    fetchMock,
    streams,
    streamBodies,
    bodyConsumed,
    historyLoaded: () => bodyConsumed("/api/chat/history"),
  };
}
