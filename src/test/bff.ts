import { vi } from "vitest";
import { NextRequest } from "next/server";

// Shared doubles for the BFF route handler tests (node project). The
// `vi.mock("@/auth", ...)` / `vi.mock("@/lib/org-resolver", ...)` calls stay
// in each test file because vi.mock is hoisted per file; their factories
// import these mocks so every route sees the same session and org.

// Distinct id and email so a route that forwards the wrong field is caught.
export const SESSION = {
  user: { id: "user-42", email: "user@example.com" },
};
export const ORG = "partner-org";

export const authMock = vi.fn();
export const resolveOrgMock = vi.fn();

/** Signed-in `SESSION` resolving to `ORG`. Call from `beforeEach`. */
export function resetAuthMocks() {
  authMock.mockReset().mockResolvedValue(SESSION);
  resolveOrgMock.mockReset().mockResolvedValue(ORG);
}

export function jsonRequest(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
  headers: Record<string, string> = {}
) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
