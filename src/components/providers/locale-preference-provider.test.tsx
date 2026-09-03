import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { LocaleProvider } from "@/i18n";
import { consoleSpy } from "@/test/console";
import {
  SUPPORTED_LOCALES,
  toResponseLanguage,
  type Locale,
} from "@/test/copy";
import {
  installFakeBff,
  PREFERENCES_ROUTE,
  type FakeBffOptions,
} from "@/test/fake-bff";
import { stubNavigatorLanguage } from "@/test/navigator";
import {
  LocalePreferenceProvider,
  saveLocalePreference,
  useLocalePreference,
} from "./locale-preference-provider";

// The provider owns the worker's stored `response_language`: a stored value
// wins over the browser, an unset value is seeded from the browser once,
// failures keep the browser locale, and the user's `choose` supersedes any
// load still in flight. It is rendered under the real LocaleProvider; only
// fetch and navigator.language are stubbed.

const JSON_HEADERS = { "Content-Type": "application/json" };
const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: JSON_HEADERS });

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <LocalePreferenceProvider>{children}</LocalePreferenceProvider>
    </LocaleProvider>
  );
}

function mount({
  navigator = "en-US",
  strict = false,
  ...bff
}: {
  navigator?: string;
  /**
   * RTL's own StrictMode option. A `<StrictMode>` inside `wrapper` does not
   * double-run the provider's effects here (measured: effects=1); this does.
   */
  strict?: boolean;
} & FakeBffOptions = {}) {
  stubNavigatorLanguage(navigator);
  const harness = installFakeBff(bff);
  const view = renderHook(() => useLocalePreference(), {
    wrapper: Wrapper,
    reactStrictMode: strict,
  });
  return { harness, ...view };
}

/** The GET has been answered and the promise chain after it has run. */
async function preferencesRead(harness: ReturnType<typeof installFakeBff>) {
  await harness.preferencesLoaded();
  await act(async () => {});
}

/** A GET that answers only when the test says so; PUTs answer at once. */
function deferredGet() {
  let answer!: (r: Response) => void;
  const route: FakeBffOptions["extraRoutes"] = {
    [PREFERENCES_ROUTE]: (_url, init) =>
      init?.method === "PUT"
        ? jsonResponse({})
        : new Promise<Response>((r) => (answer = r)),
  };
  return { route, answer: (body: unknown) => answer(jsonResponse(body)) };
}

describe("LocalePreferenceProvider — stored preference", () => {
  it.each<[string, string, Locale]>([
    ["pt", "en-US", "pt-BR"],
    ["pt-BR", "en-US", "pt-BR"],
    ["en", "pt-BR", "en"],
    // Unsupported codes fall back to the default locale for the chrome, not
    // to the browser: the stored value is an explicit choice.
    ["xx", "pt-BR", "en"],
  ])(
    "stored %j with browser %s → %s, no PUT, ready, <html lang> follows",
    async (stored, navigator, expected) => {
      const { harness, result } = mount({
        navigator,
        storedPreferences: { response_language: stored },
      });

      await waitFor(() => expect(result.current.locale).toBe(expected), {
        interval: 5,
      });
      await preferencesRead(harness);

      expect(result.current.ready).toBe(true);
      expect(document.documentElement.lang).toBe(expected);
      expect(harness.preferencePuts).toEqual([]);
      expect(consoleSpy.error).not.toHaveBeenCalled();
    }
  );
});

describe("LocalePreferenceProvider — first visit seed", () => {
  it.each<[FakeBffOptions["storedPreferences"], string, Locale]>([
    [{}, "pt-BR", "pt-BR"],
    [{}, "en-US", "en"],
    [{ response_language: "" }, "pt-BR", "pt-BR"],
  ])(
    "stored %j with browser %s keeps %s and PUTs its code exactly once",
    async (storedPreferences, navigator, expected) => {
      const { harness, result } = mount({ navigator, storedPreferences });

      await waitFor(() => expect(harness.preferencePuts).toHaveLength(1), {
        interval: 5,
      });
      await preferencesRead(harness);

      expect(harness.preferencePuts).toEqual([
        { response_language: toResponseLanguage(expected) },
      ]);
      expect(result.current.locale).toBe(expected);
      expect(result.current.ready).toBe(true);
      expect(consoleSpy.error).not.toHaveBeenCalled();
    }
  );

  it("issues exactly one PUT under StrictMode's double effect run (no PUT storm)", async () => {
    const { harness } = mount({ navigator: "pt-BR", strict: true });

    await waitFor(() => expect(harness.preferencePuts).toHaveLength(1), {
      interval: 5,
    });
    await preferencesRead(harness);
    await act(async () => {});

    expect(harness.preferencePuts).toEqual([
      { response_language: toResponseLanguage("pt-BR") },
    ]);
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });

  it("does not seed once a value is stored: a second mount sees the write and PUTs nothing", async () => {
    const first = mount({ navigator: "pt-BR" });
    await waitFor(() => expect(first.harness.preferencePuts).toHaveLength(1), {
      interval: 5,
    });
    first.unmount();

    // Same fake BFF (the PUT merged into its stored preferences), new mount.
    const { result, unmount } = renderHook(() => useLocalePreference(), {
      wrapper: Wrapper,
    });
    await preferencesRead(first.harness);

    expect(first.harness.preferencePuts).toHaveLength(1);
    expect(result.current.locale).toBe("pt-BR");
    unmount();
  });

  it("is not ready until the GET settles, and seeds nothing after an unmount", async () => {
    const { route, answer } = deferredGet();
    const { harness, result, unmount } = mount({
      navigator: "en-US",
      extraRoutes: route,
    });
    await waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(1), {
      interval: 5,
    });
    expect(result.current.ready).toBe(false);

    unmount();
    answer({});
    await act(async () => {});
    await act(async () => {});

    // Only the GET went out: an aborted mount never writes or logs.
    expect(harness.fetchMock).toHaveBeenCalledTimes(1);
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });
});

describe("LocalePreferenceProvider — failures keep the browser locale", () => {
  it("GET returning 500 logs one console.error, applies nothing, PUTs nothing, and is ready", async () => {
    const { harness, result } = mount({
      navigator: "pt-BR",
      extraRoutes: {
        [PREFERENCES_ROUTE]: () => new Response("boom", { status: 500 }),
      },
    });

    await waitFor(() => expect(consoleSpy.error).toHaveBeenCalledTimes(1), {
      interval: 5,
    });
    expect(consoleSpy.error.mock.calls[0][0]).toMatch(
      /LocalePreferenceProvider/
    );
    expect(result.current.locale).toBe("pt-BR");
    expect(result.current.ready).toBe(true);
    expect(harness.preferencePuts).toEqual([]);
  });

  it("GET rejecting (network) logs one console.error and applies nothing", async () => {
    const { result } = mount({
      navigator: "en-US",
      extraRoutes: {
        [PREFERENCES_ROUTE]: () => {
          throw new TypeError("Failed to fetch");
        },
      },
    });

    await waitFor(() => expect(consoleSpy.error).toHaveBeenCalledTimes(1), {
      interval: 5,
    });
    expect(result.current.locale).toBe("en");
    expect(result.current.ready).toBe(true);
  });

  it("a failed seed PUT logs one console.error and leaves the locale as the browser's", async () => {
    const { result } = mount({
      navigator: "pt-BR",
      extraRoutes: {
        [PREFERENCES_ROUTE]: (_url, init) =>
          init?.method === "PUT"
            ? new Response("boom", { status: 500 })
            : jsonResponse({}),
      },
    });

    await waitFor(() => expect(consoleSpy.error).toHaveBeenCalledTimes(1), {
      interval: 5,
    });
    expect(result.current.locale).toBe("pt-BR");
    expect(result.current.ready).toBe(true);
  });
});

describe("LocalePreferenceProvider — choose()", () => {
  it("PUTs the code, then applies the locale and <html lang>", async () => {
    const { harness, result } = mount({
      navigator: "en-US",
      storedPreferences: { response_language: "en" },
    });
    await preferencesRead(harness);

    await act(() => result.current.choose("pt-BR"));

    expect(harness.preferencePuts).toEqual([
      { response_language: toResponseLanguage("pt-BR") },
    ]);
    expect(result.current.locale).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });

  // Regression: a slow mount-time GET must never resolve after the user's
  // pick and revert it. `choose` supersedes the load.
  it("wins over a load still in flight: the late GET result is ignored", async () => {
    const { route, answer } = deferredGet();
    const { harness, result } = mount({
      navigator: "en-US",
      extraRoutes: route,
    });
    await waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(1), {
      interval: 5,
    });
    expect(result.current.ready).toBe(false);

    await act(() => result.current.choose("pt-BR"));
    expect(result.current.locale).toBe("pt-BR");
    expect(result.current.ready).toBe(true);

    // The stored value the GET was about to deliver says English.
    answer({ response_language: "en" });
    await act(async () => {});
    await act(async () => {});

    expect(result.current.locale).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    // The pick's PUT is the only write; the superseded load logged nothing.
    expect(
      harness.fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")
    ).toHaveLength(1);
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });

  it("resolves, logs one console.error and keeps the current locale when the PUT fails", async () => {
    const { harness, result } = mount({
      navigator: "en-US",
      extraRoutes: {
        [PREFERENCES_ROUTE]: (_url, init) =>
          init?.method === "PUT"
            ? new Response("boom", { status: 500 })
            : jsonResponse({ response_language: "en" }),
      },
    });
    await preferencesRead(harness);

    await act(() => result.current.choose("pt-BR"));

    expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    expect(consoleSpy.error.mock.calls[0][0]).toMatch(
      /LocalePreferenceProvider/
    );
    expect(result.current.locale).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("saveLocalePreference()", () => {
  it.each(SUPPORTED_LOCALES)(
    "PUTs the ISO 639-1 code for %s and resolves",
    async (locale) => {
      const harness = installFakeBff();

      await expect(saveLocalePreference(locale)).resolves.toBeUndefined();

      expect(harness.preferencePuts).toEqual([
        { response_language: toResponseLanguage(locale) },
      ]);
    }
  );

  it("rejects with the status when the BFF answers non-2xx", async () => {
    installFakeBff({
      extraRoutes: {
        [PREFERENCES_ROUTE]: () => new Response("nope", { status: 502 }),
      },
    });

    await expect(saveLocalePreference("pt-BR")).rejects.toThrow(/502/);
  });
});
