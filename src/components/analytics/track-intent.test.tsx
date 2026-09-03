// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const initMock = vi.fn();
const captureMock = vi.fn();

vi.mock("posthog-js", () => ({
  default: { init: initMock, capture: captureMock },
}));

beforeEach(() => {
  vi.resetModules();
  initMock.mockReset();
  captureMock.mockReset();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("TrackIntent", () => {
  it("captures the intent on initial mount even though its effect runs before the provider's init", async () => {
    const { AnalyticsProvider } =
      await import("@/components/providers/analytics-provider");
    const { TrackIntent } = await import("./track-intent");

    render(
      <AnalyticsProvider>
        <TrackIntent intent="understand" />
      </AnalyticsProvider>
    );

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledWith("chat_opened_with_intent", {
      intent: "understand",
    });
    expect(initMock.mock.invocationCallOrder[0]).toBeLessThan(
      captureMock.mock.invocationCallOrder[0]
    );
  });

  it("sends nothing when there is no intent", async () => {
    const { AnalyticsProvider } =
      await import("@/components/providers/analytics-provider");
    const { TrackIntent } = await import("./track-intent");

    render(
      <AnalyticsProvider>
        <TrackIntent intent={undefined} />
      </AnalyticsProvider>
    );

    expect(captureMock).not.toHaveBeenCalled();
  });
});
