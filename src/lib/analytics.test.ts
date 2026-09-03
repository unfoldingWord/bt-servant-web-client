// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureResult } from "posthog-js";

const initMock = vi.fn();
const captureMock = vi.fn();

vi.mock("posthog-js", () => ({
  default: { init: initMock, capture: captureMock },
}));

beforeEach(() => {
  vi.resetModules();
  initMock.mockReset();
  captureMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("track before initAnalytics", () => {
  it("buffers pre-init events and sends them once init runs", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const { track, initAnalytics } = await import("./analytics");

    track("chat_opened_with_intent", { intent: "understand" });
    expect(captureMock).not.toHaveBeenCalled();

    initAnalytics();

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith("chat_opened_with_intent", {
      intent: "understand",
    });
    // init must precede the flushed capture
    expect(initMock.mock.invocationCallOrder[0]).toBeLessThan(
      captureMock.mock.invocationCallOrder[0]
    );
  });

  it("sends events directly once initialized", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const { track, initAnalytics } = await import("./analytics");
    initAnalytics();
    track("chat_message_sent", { message_type: "text" });
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("drops buffered events when analytics is disabled (no key)", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { track, initAnalytics } = await import("./analytics");
    track("chat_opened_with_intent", { intent: "understand" });
    initAnalytics();
    track("chat_message_sent");
    expect(initMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("installs the URL scrubber as before_send", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const { initAnalytics, scrubEvent } = await import("./analytics");
    initAnalytics();
    const config = initMock.mock.calls[0][1];
    expect(config.before_send).toBe(scrubEvent);
    expect(config.autocapture).toBe(false);
    expect(config.save_campaign_params).toBe(false);
  });
});

describe("scrubEvent", () => {
  const SENSITIVE = "https://app.btservant.ai/chat?intent=private%20text#frag";
  const CLEAN = "https://app.btservant.ai/chat";

  it("strips the query string and hash from URL properties", async () => {
    const { scrubEvent } = await import("./analytics");
    const event = {
      event: "$pageview",
      properties: {
        $current_url: SENSITIVE,
        $referrer: "https://www.btservant.ai/?utm_source=x",
        $pathname: "/chat",
        $set_once: { $initial_current_url: SENSITIVE },
      },
      $set_once: {
        $initial_current_url: SENSITIVE,
        $initial_referrer: "$direct",
      },
    } as unknown as CaptureResult;

    const out = scrubEvent(event)!;
    expect(out.properties.$current_url).toBe(CLEAN);
    expect(out.properties.$referrer).toBe("https://www.btservant.ai/");
    expect(out.properties.$pathname).toBe("/chat");
    expect(out.properties.$set_once.$initial_current_url).toBe(CLEAN);
    expect(out.$set_once?.$initial_current_url).toBe(CLEAN);
    expect(out.$set_once?.$initial_referrer).toBe("$direct");
    expect(JSON.stringify(out)).not.toContain("intent=");
  });

  it("scrubs the page href inside session replay snapshots", async () => {
    const { scrubEvent } = await import("./analytics");
    const event = {
      event: "$snapshot",
      properties: {
        $snapshot_data: [
          { type: 4, data: { href: SENSITIVE, width: 1, height: 1 } },
          { type: 2, data: { node: {} } },
        ],
      },
    } as unknown as CaptureResult;

    const out = scrubEvent(event)!;
    expect(out.properties.$snapshot_data[0].data.href).toBe(CLEAN);
    expect(JSON.stringify(out)).not.toContain("intent=");
  });

  it("drops campaign and click-id properties in every shape", async () => {
    const { scrubEvent, isCampaignKey } = await import("./analytics");
    const event = {
      event: "$pageview",
      properties: {
        utm_campaign: "SECRET",
        utm_new_thing: "SECRET",
        gclid: "SECRET",
        $set_once: { $initial_utm_campaign: "SECRET", $initial_fbclid: "S" },
        $pathname: "/chat",
      },
      $set: { utm_source: "SECRET" },
      $set_once: {
        $initial_gclid: "SECRET",
        $session_entry_utm_content: "SECRET",
        $initial_pathname: "/chat",
      },
    } as unknown as CaptureResult;

    const out = scrubEvent(event)!;
    expect(JSON.stringify(out)).not.toContain("SECRET");
    expect(out.properties.$pathname).toBe("/chat");
    expect(out.$set_once?.$initial_pathname).toBe("/chat");
    expect(isCampaignKey("$current_url")).toBe(false);
    expect(isCampaignKey("intent")).toBe(false);
  });

  it("passes null and non-URL strings through untouched", async () => {
    const { scrubEvent, scrubUrl } = await import("./analytics");
    expect(scrubEvent(null)).toBeNull();
    expect(scrubUrl("$direct")).toBe("$direct");
  });
});
