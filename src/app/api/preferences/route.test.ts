import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
const resolveOrgMock = vi.fn();
const getPrefsMock = vi.fn();
const updatePrefsMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/org-resolver", () => ({
  resolveOrgForEmail: resolveOrgMock,
}));
vi.mock("@/lib/engine-client", () => ({
  getUserPreferences: getPrefsMock,
  updateUserPreferences: updatePrefsMock,
}));

const session = { user: { id: "user@example.com", email: "user@example.com" } };

function putRequest(body: unknown) {
  return new NextRequest("http://localhost/api/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset().mockResolvedValue(session);
  resolveOrgMock.mockReset().mockResolvedValue("partner-org");
  getPrefsMock.mockReset();
  updatePrefsMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/preferences", () => {
  it("returns the engine payload for the session user and resolved org", async () => {
    getPrefsMock.mockResolvedValueOnce({ response_language: "pt" });
    const { GET } = await import("./route");

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ response_language: "pt" });
    expect(resolveOrgMock).toHaveBeenCalledWith("user@example.com");
    expect(getPrefsMock).toHaveBeenCalledWith(
      "user@example.com",
      "partner-org"
    );
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");

    const res = await GET();

    expect(res.status).toBe(401);
    expect(getPrefsMock).not.toHaveBeenCalled();
  });
});

describe("PUT /api/preferences", () => {
  it("rejects a non-string response_language with 400 and does not call the engine", async () => {
    const { PUT } = await import("./route");

    const res = await PUT(putRequest({ response_language: 42 }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: unknown };
    expect(body.error).toBe("Invalid request");
    expect(Array.isArray(body.details)).toBe(true);
    expect(updatePrefsMock).not.toHaveBeenCalled();
  });

  it("forwards a valid response_language to the engine client and returns its payload", async () => {
    updatePrefsMock.mockResolvedValueOnce({ response_language: "pt" });
    const { PUT } = await import("./route");

    const res = await PUT(putRequest({ response_language: "pt" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ response_language: "pt" });
    expect(updatePrefsMock).toHaveBeenCalledWith(
      "user@example.com",
      { response_language: "pt" },
      "partner-org"
    );
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValueOnce(null);
    const { PUT } = await import("./route");

    const res = await PUT(putRequest({ response_language: "pt" }));

    expect(res.status).toBe(401);
    expect(updatePrefsMock).not.toHaveBeenCalled();
  });
});
