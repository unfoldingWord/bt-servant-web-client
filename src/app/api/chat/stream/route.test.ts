import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
const resolveOrgMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/org-resolver", () => ({
  resolveOrgForEmail: resolveOrgMock,
}));

const ENGINE_BASE_URL = "https://engine.test";
const ENGINE_API_KEY = "engine-key-abc";
const SESSION_COOKIE = "authjs.session-token=SESSION-SECRET-xyz";
const session = { user: { id: "user@example.com", email: "user@example.com" } };

function streamRequest(body: unknown) {
  return new NextRequest("http://localhost/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: SESSION_COOKIE,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("ENGINE_BASE_URL", ENGINE_BASE_URL);
  vi.stubEnv("ENGINE_API_KEY", ENGINE_API_KEY);
  vi.stubEnv("CLIENT_ID", "web");
  authMock.mockReset().mockResolvedValue(session);
  resolveOrgMock.mockReset().mockResolvedValue("partner-org");
  fetchMock.mockReset().mockResolvedValue(
    new Response("data: {}\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/chat/stream", () => {
  it("forwards user_id, org, message, message_type and client_id with the engine Authorization header", async () => {
    const { POST } = await import("./route");

    const res = await POST(streamRequest({ message: "Hello there" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${ENGINE_BASE_URL}/api/v1/chat/stream`);
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${ENGINE_API_KEY}`);
    expect(headers.Accept).toBe("text/event-stream");

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      user_id: "user@example.com",
      org: "partner-org",
      message: "Hello there",
      message_type: "text",
      client_id: "web",
    });
  });

  it("never places the session token or engine key in the upstream URL, and does not forward the cookie", async () => {
    const { POST } = await import("./route");

    await POST(streamRequest({ message: "Hello there" }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("SESSION-SECRET");
    expect(url).not.toContain(ENGINE_API_KEY);
    expect(url).not.toContain("user@example.com");

    const headers = init.headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain(
      "cookie"
    );
    expect(JSON.stringify(init)).not.toContain("SESSION-SECRET");
  });

  it("includes audio fields only when the client sends an audio message", async () => {
    const { POST } = await import("./route");

    await POST(
      streamRequest({
        message: "",
        message_type: "audio",
        audio_base64: "QUJD",
        audio_format: "webm",
      })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.message_type).toBe("audio");
    expect(body.audio_base64).toBe("QUJD");
    expect(body.audio_format).toBe("webm");
  });

  it("returns 401 and does not call upstream without a session", async () => {
    authMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");

    const res = await POST(streamRequest({ message: "Hello" }));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 and does not call upstream on an invalid body", async () => {
    const { POST } = await import("./route");

    const res = await POST(streamRequest({ message_type: "text" }));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
