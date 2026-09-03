import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { LocaleProvider, useLocale } from "@/i18n";
import { consoleSpy } from "@/test/console";
import { LOCALES, SUPPORTED_LOCALES, type Locale } from "@/test/copy";
import { installFakeBff, type FakeBffOptions } from "@/test/fake-bff";
import { stubNavigatorLanguage } from "@/test/navigator";
import {
  saveLocalePreference,
  usePreferredLocale,
} from "./use-preferred-locale";

// The hook syncs the interface locale with the worker's stored
// `response_language`: a stored value wins over the browser, an unset value is
// seeded from the browser once, and failures keep the browser locale. It is
// rendered under the real LocaleProvider; only fetch and navigator.language
// are stubbed.

const PREFERENCES = "/api/preferences";

/** The worker-side code for `locale`, read from the registry, never hardcoded. */
const codeFor = (locale: Locale) => LOCALES[locale].primaries[0];

afterEach(() => {
  document.documentElement.lang = "";
});

function Wrapper({ children }: { children: ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>;
}

function mount({
  navigator = "en-US",
  paused = false,
  strict = false,
  ...bff
}: {
  navigator?: string;
  paused?: boolean;
  /**
   * RTL's own StrictMode option. A `<StrictMode>` inside `wrapper` does not
   * double-run the hook's effects here (measured: effects=1); this does.
   */
  strict?: boolean;
} & FakeBffOptions = {}) {
  stubNavigatorLanguage(navigator);
  const harness = installFakeBff(bff);
  const view = renderHook(
    ({ paused }: { paused: boolean }) => {
      usePreferredLocale({ paused });
      return useLocale().locale;
    },
    { wrapper: Wrapper, initialProps: { paused }, reactStrictMode: strict }
  );
  return { harness, ...view };
}

/** The GET has been answered and the promise chain after it has run. */
async function preferencesRead(harness: ReturnType<typeof installFakeBff>) {
  await harness.bodyConsumed(PREFERENCES);
  await act(async () => {});
}

describe("usePreferredLocale — stored preference", () => {
  it.each<[string, string, Locale]>([
    ["pt", "en-US", "pt-BR"],
    ["pt-BR", "en-US", "pt-BR"],
    ["en", "pt-BR", "en"],
    // Unsupported codes fall back to the default locale for the chrome, not
    // to the browser: the stored value is an explicit choice.
    ["xx", "pt-BR", "en"],
  ])(
    "stored %j with browser %s → %s, no PUT, <html lang> follows",
    async (stored, navigator, expected) => {
      const { harness, result } = mount({
        navigator,
        storedPreferences: { response_language: stored },
      });

      await waitFor(() => expect(result.current).toBe(expected));
      await preferencesRead(harness);

      expect(document.documentElement.lang).toBe(expected);
      expect(harness.preferencePuts).toEqual([]);
      expect(consoleSpy.error).not.toHaveBeenCalled();
    }
  );
});

describe("usePreferredLocale — first visit seed", () => {
  it.each<[FakeBffOptions["storedPreferences"], string, Locale]>([
    [{}, "pt-BR", "pt-BR"],
    [{}, "en-US", "en"],
    [{ response_language: "" }, "pt-BR", "pt-BR"],
  ])(
    "stored %j with browser %s keeps %s and PUTs its ISO 639-1 code exactly once",
    async (storedPreferences, navigator, expected) => {
      const { harness, result } = mount({ navigator, storedPreferences });

      await waitFor(() => expect(harness.preferencePuts).toHaveLength(1));
      await preferencesRead(harness);

      expect(harness.preferencePuts).toEqual([
        { response_language: codeFor(expected) },
      ]);
      expect(codeFor(expected)).toMatch(/^[a-z]{2}$/); // what the worker accepts
      expect(result.current).toBe(expected);
      expect(consoleSpy.error).not.toHaveBeenCalled();
    }
  );

  it("issues exactly one PUT under StrictMode's double effect run (no PUT storm)", async () => {
    const { harness } = mount({ navigator: "pt-BR", strict: true });

    await waitFor(() => expect(harness.preferencePuts).toHaveLength(1));
    await preferencesRead(harness);
    await act(async () => {});

    // Two effect runs, two GETs; only the run that was not aborted writes.
    expect(
      harness.fetchMock.mock.calls.filter(([, init]) => init?.method !== "PUT")
    ).toHaveLength(2);
    expect(harness.preferencePuts).toEqual([{ response_language: "pt" }]);
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });

  it("does not seed once a value is stored: a second mount sees the write and PUTs nothing", async () => {
    const first = mount({ navigator: "pt-BR" });
    await waitFor(() => expect(first.harness.preferencePuts).toHaveLength(1));
    first.unmount();

    // Same fake BFF (the PUT merged into its stored preferences), new mount.
    const { result, unmount } = renderHook(
      () => {
        usePreferredLocale();
        return useLocale().locale;
      },
      { wrapper: Wrapper }
    );
    await preferencesRead(first.harness);

    expect(first.harness.preferencePuts).toHaveLength(1);
    expect(result.current).toBe("pt-BR");
    unmount();
  });
});

describe("usePreferredLocale — failures keep the browser locale", () => {
  it("GET returning 500 logs one console.error, applies nothing and PUTs nothing", async () => {
    const { harness, result } = mount({
      navigator: "pt-BR",
      extraRoutes: {
        [PREFERENCES]: () => new Response("boom", { status: 500 }),
      },
    });

    await waitFor(() => expect(consoleSpy.error).toHaveBeenCalledTimes(1));
    expect(consoleSpy.error.mock.calls[0][0]).toMatch(/usePreferredLocale/);
    expect(result.current).toBe("pt-BR");
    expect(harness.preferencePuts).toEqual([]);
  });

  it("GET rejecting (network) logs one console.error and applies nothing", async () => {
    const { result } = mount({
      navigator: "en-US",
      extraRoutes: {
        [PREFERENCES]: () => {
          throw new TypeError("Failed to fetch");
        },
      },
    });

    await waitFor(() => expect(consoleSpy.error).toHaveBeenCalledTimes(1));
    expect(result.current).toBe("en");
  });

  it("a failed seed PUT logs one console.error and leaves the locale as the browser's", async () => {
    const { harness, result } = mount({
      navigator: "pt-BR",
      extraRoutes: {
        [PREFERENCES]: (_url, init) =>
          init?.method === "PUT"
            ? new Response("boom", { status: 500 })
            : new Response("{}", {
                headers: { "Content-Type": "application/json" },
              }),
      },
    });

    await waitFor(() => expect(consoleSpy.error).toHaveBeenCalledTimes(1));
    expect(result.current).toBe("pt-BR");
    expect(harness.preferencePuts).toEqual([]); // the shared recorder was bypassed
  });

  it("unmounting before an empty GET resolves seeds nothing and logs nothing", async () => {
    let answer!: (r: Response) => void;
    const puts: unknown[] = [];
    const { harness, unmount } = mount({
      navigator: "en-US",
      extraRoutes: {
        [PREFERENCES]: (_url, init) => {
          if (init?.method === "PUT") {
            puts.push(JSON.parse(String(init.body)));
            return new Response("{}");
          }
          // The GET answers when the test says so.
          return new Promise<Response>((r) => (answer = r));
        },
      },
    });
    await waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(1));

    unmount();
    answer(
      new Response("{}", { headers: { "Content-Type": "application/json" } })
    );
    await act(async () => {});
    await act(async () => {});

    expect(puts).toEqual([]);
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });
});

describe("usePreferredLocale — paused (never flip mid-stream)", () => {
  it("holds a loaded preference while paused and applies it once unpaused", async () => {
    const { harness, result, rerender } = mount({
      navigator: "en-US",
      paused: true,
      storedPreferences: { response_language: "pt" },
    });

    await preferencesRead(harness);
    expect(result.current).toBe("en");

    rerender({ paused: false });
    await act(async () => {});
    expect(result.current).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
  });
});

describe("saveLocalePreference()", () => {
  it.each(SUPPORTED_LOCALES)(
    "PUTs the ISO 639-1 code for %s and resolves",
    async (locale) => {
      const harness = installFakeBff();

      await expect(saveLocalePreference(locale)).resolves.toBeUndefined();

      expect(harness.preferencePuts).toEqual([
        { response_language: codeFor(locale) },
      ]);
      const [, init] = harness.fetchMock.mock.calls[0];
      expect(init?.method).toBe("PUT");
      expect(new Headers(init?.headers).get("Content-Type")).toBe(
        "application/json"
      );
    }
  );

  it("rejects with the status when the BFF answers non-2xx", async () => {
    installFakeBff({
      extraRoutes: {
        [PREFERENCES]: () => new Response("nope", { status: 502 }),
      },
    });

    await expect(saveLocalePreference("pt-BR")).rejects.toThrow(/502/);
  });
});
