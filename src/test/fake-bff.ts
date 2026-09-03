import { expect, vi, type Mock } from "vitest";
import { waitFor } from "@testing-library/react";
import type { ChatHistoryEntry, UserPreferences } from "@/types/engine";
import { createSseStream, type SseStream } from "./sse";

// A fetch router standing in for the BFF (`/api/*`). Installed as the global
// `fetch`; the vitest config's `unstubGlobals` removes it after each test.

/** The preference route, for tests that override or await it. */
export const PREFERENCES_ROUTE = "/api/preferences";

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
  /**
   * What `GET /api/preferences` returns. Default: `{}` (a user with nothing
   * stored yet). A `PUT` merges into it, so a later `GET` sees the write.
   */
  storedPreferences?: UserPreferences;
  /**
   * Answers `PUT /api/preferences` after the body has been recorded in
   * `preferencePuts`. Default: 200 with the merged stored value.
   */
  preferencePutResponse?: () => Response | Promise<Response>;
  /** Further routes keyed by pathname (the query string is ignored). */
  extraRoutes?: Record<string, RouteHandler>;
}

export interface FakeBff {
  fetchMock: Mock<typeof fetch>;
  /** Controllable streams opened by the default stream route, oldest first. */
  streams: SseStream[];
  /** Parsed JSON bodies of every `POST /api/chat/stream`, oldest first. */
  streamBodies: Array<Record<string, unknown>>;
  /** Parsed JSON bodies of every `PUT /api/preferences`, oldest first. */
  preferencePuts: Array<Record<string, unknown>>;
  /**
   * Resolves once the client has consumed `times` response bodies for
   * `pathname` (`json()`, `text()` or `blob()`; one per request). Any state
   * the client sets in the same promise chain has landed by then, inside a
   * `waitFor` window, so no act() warning is raised. Real timers only.
   */
  bodyConsumed: (pathname: string, times?: number) => Promise<void>;
  /** `bodyConsumed("/api/chat/history")`: the thread shows the branch the user would see. */
  historyLoaded: () => Promise<void>;
  /** `bodyConsumed(PREFERENCES_ROUTE, times)`: the `times`-th GET has been read and applied. */
  preferencesLoaded: (times?: number) => Promise<void>;
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
  const preferencePuts: Array<Record<string, unknown>> = [];
  let stored: UserPreferences = { ...opts.storedPreferences };
  const consumed = new Map<string, number>();

  const routes: Record<string, RouteHandler> = {
    "/api/chat/history": () => json({ entries: opts.historyEntries ?? [] }),
    "/api/chat/stream": (url, init) => {
      streamBodies.push(JSON.parse(String(init?.body)));
      if (opts.onStream) return opts.onStream(url, init);
      const stream = createSseStream(init?.signal ?? null);
      streams.push(stream);
      return stream.response;
    },
    [PREFERENCES_ROUTE]: (_url, init) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        preferencePuts.push(body);
        stored = { ...stored, ...body };
        if (opts.preferencePutResponse) return opts.preferencePutResponse();
      }
      return json(stored);
    },
    // next-auth's getCsrfToken() (user menu) fetches this on mount.
    "/api/auth/csrf": () => json({ csrfToken: "test-csrf-token" }),
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
      consumed.set(pathname, (consumed.get(pathname) ?? 0) + 1)
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  // waitFor polls on the real clock; under vi.useFakeTimers() it would hang
  // until its own timeout, so fail fast with the caller's name instead.
  const waitConsumed = async (name: string, pathname: string, times = 1) => {
    if (vi.isFakeTimers()) throw new Error(`${name} requires real timers`);
    await waitFor(
      () => expect(consumed.get(pathname) ?? 0).toBeGreaterThanOrEqual(times),
      { interval: 5 }
    );
  };

  return {
    fetchMock,
    streams,
    streamBodies,
    preferencePuts,
    bodyConsumed: (pathname, times) =>
      waitConsumed("bodyConsumed", pathname, times),
    historyLoaded: () => waitConsumed("historyLoaded", "/api/chat/history"),
    preferencesLoaded: (times) =>
      waitConsumed("preferencesLoaded", PREFERENCES_ROUTE, times),
  };
}
