// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://app.btservant.ai/chat?intent=SECRET_INTENT&utm_campaign=SECRET_CAMPAIGN&utm_content=SECRET_CONTENT&gclid=SECRET_GCLID&fbclid=SECRET_FBCLID#SECRET_HASH"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import posthog, { type CaptureResult } from "posthog-js";

/**
 * Runs the REAL posthog-js SDK (no mock) against a page whose address bar
 * carries sensitive values in every slot the SDK reads: the query string,
 * campaign params, ad click ids and the hash. Anything the SDK would put on
 * the wire is intercepted via `eventCaptured` (fires after `before_send`)
 * and must not contain any of those values.
 */

const SECRETS = [
  "SECRET_INTENT",
  "SECRET_CAMPAIGN",
  "SECRET_CONTENT",
  "SECRET_GCLID",
  "SECRET_FBCLID",
  "SECRET_HASH",
];

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_integration_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "http://127.0.0.1:9");
  // Never let the SDK reach the network from a unit test.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })))
  );
  Object.defineProperty(navigator, "sendBeacon", {
    value: vi.fn(() => true),
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
  sessionStorage.clear();
});

describe("analytics integration (real posthog-js)", () => {
  it("never transmits address-bar text: not in URLs, campaign props, or set-once", async () => {
    const captured: CaptureResult[] = [];
    const { initAnalytics, track } = await import("./analytics");

    initAnalytics();
    posthog.on("eventCaptured", (event) =>
      captured.push(event as CaptureResult)
    );

    track("chat_opened_with_intent", { intent: "understand" });
    posthog.capture("$pageview");
    // allow any deferred capture (initial pageview, pageleave hooks) to run
    await new Promise((r) => setTimeout(r, 50));

    const names = captured.map((e) => e.event);
    expect(names).toContain("chat_opened_with_intent");
    expect(names).toContain("$pageview");

    for (const event of captured) {
      const wire = JSON.stringify(event);
      for (const secret of SECRETS) {
        expect(wire, `${event.event} leaked ${secret}`).not.toContain(secret);
      }
      // the bare campaign keys the SDK extracts must be gone entirely
      for (const key of ["utm_campaign", "utm_content", "gclid", "fbclid"]) {
        expect(
          event.properties,
          `${event.event} has ${key}`
        ).not.toHaveProperty(key);
      }
    }

    // sanity: the scrubbed URL is still useful for pageview analytics
    const pageview = captured.find((e) => e.event === "$pageview")!;
    expect(pageview.properties.$current_url).toBe(
      "https://app.btservant.ai/chat"
    );
    expect(pageview.properties.$pathname).toBe("/chat");
  });
});
