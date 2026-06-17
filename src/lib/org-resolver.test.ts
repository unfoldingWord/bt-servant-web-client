import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const putMock = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      CHAT_ORG_KV: {
        get: getMock,
        put: putMock,
      },
    },
  }),
}));

beforeEach(() => {
  getMock.mockReset();
  putMock.mockReset();
  vi.stubEnv("DEFAULT_ORG", "test-default");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveOrgForEmail", () => {
  it("returns the value bound in CHAT_ORG_KV when one exists", async () => {
    getMock.mockResolvedValueOnce("partner-org-x");
    const { resolveOrgForEmail } = await import("./org-resolver");

    const result = await resolveOrgForEmail("user@example.com");

    expect(getMock).toHaveBeenCalledWith("user@example.com");
    expect(result).toBe("partner-org-x");
  });

  it("falls back to DEFAULT_ORG on a KV miss (no write)", async () => {
    getMock.mockResolvedValueOnce(null);
    const { resolveOrgForEmail } = await import("./org-resolver");

    const result = await resolveOrgForEmail("new@example.com");

    expect(result).toBe("test-default");
    expect(putMock).not.toHaveBeenCalled();
  });

  it.each([
    ["empty string", ""],
    ["path traversal", "../etc/passwd"],
    ["slash", "foo/bar"],
    ["overlong", "x".repeat(101)],
    ["query-string injection", "uW?role=admin"],
    ["control char", "uW\n"],
  ])(
    "falls back to DEFAULT_ORG when CHAT_ORG_KV holds an invalid slug (%s)",
    async (_label, badValue) => {
      getMock.mockResolvedValueOnce(badValue);
      const { resolveOrgForEmail } = await import("./org-resolver");

      const result = await resolveOrgForEmail("user@example.com");

      expect(result).toBe("test-default");
    }
  );

  it.each([
    "Test Organization",
    "Bible Society of Jordan",
    "uW",
    "unfolding-Word",
    "PBT",
  ])(
    "accepts real org names that include spaces / mixed case (%s)",
    async (orgName) => {
      getMock.mockResolvedValueOnce(orgName);
      const { resolveOrgForEmail } = await import("./org-resolver");

      const result = await resolveOrgForEmail("user@example.com");

      expect(result).toBe(orgName);
    }
  );
});

describe("provisionOrgForEmail", () => {
  it("writes email → DEFAULT_ORG on first sight (KV miss)", async () => {
    getMock.mockResolvedValueOnce(null);
    const { provisionOrgForEmail } = await import("./org-resolver");

    await provisionOrgForEmail("new@example.com");

    expect(putMock).toHaveBeenCalledWith("new@example.com", "test-default");
  });

  it("does not overwrite an existing value (partner-specific orgs survive)", async () => {
    getMock.mockResolvedValueOnce("partner-org-x");
    const { provisionOrgForEmail } = await import("./org-resolver");

    await provisionOrgForEmail("partner@example.com");

    expect(putMock).not.toHaveBeenCalled();
  });
});
