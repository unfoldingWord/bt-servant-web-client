import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authMock,
  jsonRequest,
  ORG,
  resetAuthMocks,
  resolveOrgMock,
  SESSION,
} from "@/test/bff";
import { GET, PUT } from "./route";

const { getPrefsMock, updatePrefsMock } = vi.hoisted(() => ({
  getPrefsMock: vi.fn(),
  updatePrefsMock: vi.fn(),
}));

vi.mock("@/auth", async () => ({
  auth: (await import("@/test/bff")).authMock,
}));
vi.mock("@/lib/org-resolver", async () => ({
  resolveOrgForEmail: (await import("@/test/bff")).resolveOrgMock,
}));
vi.mock("@/lib/engine-client", () => ({
  getUserPreferences: getPrefsMock,
  updateUserPreferences: updatePrefsMock,
}));

const putRequest = (body: unknown) =>
  jsonRequest("http://localhost/api/preferences", "PUT", body);

beforeEach(() => {
  resetAuthMocks();
  getPrefsMock.mockReset();
  updatePrefsMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/preferences", () => {
  it.each([
    [{ response_language: "pt" }],
    [{ response_language: "en" }],
    // A user with nothing stored yet: the engine client maps the worker's
    // 404 to `{}` and the client seeds from the browser.
    [{}],
  ])(
    "returns the engine payload %j for the session user and resolved org",
    async (payload) => {
      getPrefsMock.mockResolvedValueOnce(payload);

      const res = await GET();

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(payload);
      expect(resolveOrgMock).toHaveBeenCalledWith(SESSION.user.email);
      expect(getPrefsMock).toHaveBeenCalledWith(SESSION.user.id, ORG);
    }
  );

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(getPrefsMock).not.toHaveBeenCalled();
  });
});

describe("PUT /api/preferences", () => {
  it("rejects a non-string response_language with 400 and does not call the engine", async () => {
    const res = await PUT(putRequest({ response_language: 42 }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: unknown };
    expect(body.error).toBe("Invalid request");
    expect(Array.isArray(body.details)).toBe(true);
    expect(updatePrefsMock).not.toHaveBeenCalled();
  });

  // The codes the client's language picker sends (ISO 639-1, one per locale).
  it.each(["pt", "en"])(
    "forwards response_language %j to the engine client and returns its payload",
    async (code) => {
      updatePrefsMock.mockResolvedValueOnce({ response_language: code });

      const res = await PUT(putRequest({ response_language: code }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ response_language: code });
      expect(updatePrefsMock).toHaveBeenCalledWith(
        SESSION.user.id,
        { response_language: code },
        ORG
      );
    }
  );

  it("returns 500 (not the raw error) when the engine client rejects", async () => {
    updatePrefsMock.mockRejectedValueOnce(new Error("Engine API error: 400"));

    const res = await PUT(putRequest({ response_language: "pt" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await PUT(putRequest({ response_language: "pt" }));

    expect(res.status).toBe(401);
    expect(updatePrefsMock).not.toHaveBeenCalled();
  });
});
