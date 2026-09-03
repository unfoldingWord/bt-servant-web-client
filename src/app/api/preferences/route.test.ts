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
  it("returns the engine payload for the session user and resolved org", async () => {
    getPrefsMock.mockResolvedValueOnce({ response_language: "pt" });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ response_language: "pt" });
    expect(resolveOrgMock).toHaveBeenCalledWith(SESSION.user.email);
    expect(getPrefsMock).toHaveBeenCalledWith(SESSION.user.id, ORG);
  });

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

  it("forwards a valid response_language to the engine client and returns its payload", async () => {
    updatePrefsMock.mockResolvedValueOnce({ response_language: "pt" });

    const res = await PUT(putRequest({ response_language: "pt" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ response_language: "pt" });
    expect(updatePrefsMock).toHaveBeenCalledWith(
      SESSION.user.id,
      { response_language: "pt" },
      ORG
    );
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await PUT(putRequest({ response_language: "pt" }));

    expect(res.status).toBe(401);
    expect(updatePrefsMock).not.toHaveBeenCalled();
  });
});
