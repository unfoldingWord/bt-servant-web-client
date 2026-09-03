import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authMock,
  jsonRequest,
  ORG,
  resetAuthMocks,
  SESSION,
} from "@/test/bff";
import { sseResponse } from "@/test/sse";
import { POST } from "./route";

// The route reads ENGINE_BASE_URL / ENGINE_API_KEY / CLIENT_ID at module
// load, so the env is stubbed once, ahead of the static import above
// (vi.hoisted runs before imports).
const { ENGINE_BASE_URL, ENGINE_API_KEY, CLIENT_ID } = vi.hoisted(() => {
  const env = {
    ENGINE_BASE_URL: "https://engine.test",
    ENGINE_API_KEY: "engine-key-abc",
    CLIENT_ID: "web",
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return env;
});

vi.mock("@/auth", async () => ({
  auth: (await import("@/test/bff")).authMock,
}));
vi.mock("@/lib/org-resolver", async () => ({
  resolveOrgForEmail: (await import("@/test/bff")).resolveOrgMock,
}));

const SESSION_COOKIE = "authjs.session-token=SESSION-SECRET-xyz";
const fetchMock = vi.fn();

const streamRequest = (body: unknown) =>
  jsonRequest("http://localhost/api/chat/stream", "POST", body, {
    Cookie: SESSION_COOKIE,
  });

/** The single upstream call's `(url, init)`. */
const upstreamCall = () => fetchMock.mock.calls[0] as [string, RequestInit];

beforeEach(() => {
  resetAuthMocks();
  fetchMock.mockReset().mockResolvedValue(sseResponse([{ type: "keepalive" }]));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/chat/stream", () => {
  it("forwards user_id, org, message, message_type and client_id with the engine Authorization header", async () => {
    const res = await POST(streamRequest({ message: "Hello there" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = upstreamCall();
    expect(url).toBe(`${ENGINE_BASE_URL}/api/v1/chat/stream`);
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${ENGINE_API_KEY}`);
    expect(headers.Accept).toBe("text/event-stream");

    expect(JSON.parse(init.body as string)).toEqual({
      user_id: SESSION.user.id,
      org: ORG,
      message: "Hello there",
      message_type: "text",
      client_id: CLIENT_ID,
    });
  });

  it("never places the session token or engine key in the upstream URL, and does not forward the cookie", async () => {
    await POST(streamRequest({ message: "Hello there" }));

    const [url, init] = upstreamCall();
    expect(url).not.toContain("SESSION-SECRET");
    expect(url).not.toContain(ENGINE_API_KEY);
    expect(url).not.toContain(SESSION.user.id);
    expect(url).not.toContain(SESSION.user.email);

    const headers = init.headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain(
      "cookie"
    );
    expect(JSON.stringify(init)).not.toContain("SESSION-SECRET");
  });

  it("includes audio fields only when the client sends an audio message", async () => {
    await POST(
      streamRequest({
        message: "",
        message_type: "audio",
        audio_base64: "QUJD",
        audio_format: "webm",
      })
    );

    const [, init] = upstreamCall();
    const body = JSON.parse(init.body as string);
    expect(body.message_type).toBe("audio");
    expect(body.audio_base64).toBe("QUJD");
    expect(body.audio_format).toBe("webm");
  });

  it("returns 401 and does not call upstream without a session", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await POST(streamRequest({ message: "Hello" }));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 and does not call upstream on an invalid body", async () => {
    const res = await POST(streamRequest({ message_type: "text" }));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
