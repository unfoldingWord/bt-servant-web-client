import { describe, expect, it, vi } from "vitest";
import { act, render, waitFor, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { LocaleProvider, useLocale } from "@/i18n";
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
// failures keep the browser locale, a loaded value is held while `hold` is
// true (a reply is in flight), and the user's `choose` supersedes any load
// still in flight. It is rendered under the real LocaleProvider; only fetch
// and navigator.language are stubbed.

const WAIT = { interval: 5 };
const JSON_HEADERS = { "Content-Type": "application/json" };
const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: JSON_HEADERS });
const failed = () => new Response("boom", { status: 500 });

type Preference = ReturnType<typeof useLocalePreference>;

/** Reports the hook's latest value on every render (what renderHook does internally). */
function Probe({ onValue }: { onValue: (value: Preference) => void }) {
  onValue(useLocalePreference());
  return null;
}

/**
 * Renders the provider under the real LocaleProvider with a probe that
 * exposes `useLocalePreference()` as `result.current`; `rerender` changes
 * `hold`. (renderHook's `initialProps` reach the hook, not the wrapper, so
 * a wrapper-level prop needs `render`.)
 */
function mount({
  navigator = "en-US",
  hold = false,
  strict = false,
  harness: reused,
  ...bff
}: {
  navigator?: string;
  hold?: boolean;
  /**
   * RTL's own StrictMode option. A `<StrictMode>` inside the tree does not
   * double-run the provider's effects here (measured: effects=1); this does.
   */
  strict?: boolean;
  /** Reuse a fake BFF from an earlier mount instead of installing a new one. */
  harness?: ReturnType<typeof installFakeBff>;
} & FakeBffOptions = {}) {
  const harness = reused ?? installFakeBff(bff);
  if (!reused) stubNavigatorLanguage(navigator);
  const result = { current: null as unknown as Preference };
  const tree = (h: boolean) => (
    <LocaleProvider>
      <LocalePreferenceProvider hold={h}>
        <Probe onValue={(v) => (result.current = v)} />
      </LocalePreferenceProvider>
    </LocaleProvider>
  );
  const view = render(tree(hold), { reactStrictMode: strict });
  return {
    harness,
    result,
    unmount: view.unmount,
    rerender: (next: { hold: boolean }) => view.rerender(tree(next.hold)),
  };
}

/** The `times`-th GET has been answered and the promise chain after it has run. */
async function preferencesRead(
  harness: ReturnType<typeof installFakeBff>,
  times = 1
) {
  await harness.preferencesLoaded(times);
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
  return {
    route,
    answer: async (body: unknown) => {
      answer(jsonResponse(body));
      await act(async () => {});
      await act(async () => {});
    },
  };
}

const putCalls = (harness: ReturnType<typeof installFakeBff>) =>
  harness.fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");

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

      await waitFor(() => expect(result.current.locale).toBe(expected), WAIT);
      await preferencesRead(harness);

      expect(result.current.ready).toBe(true);
      expect(document.documentElement.lang).toBe(expected);
      expect(harness.preferencePuts).toEqual([]);
      expect(consoleSpy.error).not.toHaveBeenCalled();
    }
  );

  // Regression: the chrome must never flip under an animating reply. A value
  // the load delivers while `hold` is true waits for `hold` to clear.
  it("holds a value loaded while `hold` is true and applies it once `hold` clears", async () => {
    const { harness, result, rerender } = mount({
      navigator: "en-US",
      hold: true,
      storedPreferences: { response_language: "pt" },
    });

    await preferencesRead(harness);
    expect(result.current.ready).toBe(true);
    expect(result.current.locale).toBe("en");
    expect(document.documentElement.lang).toBe("en");

    rerender({ hold: false });
    await act(async () => {});

    expect(result.current.locale).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });
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

      await waitFor(() => expect(harness.preferencePuts).toHaveLength(1), WAIT);
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

    await waitFor(() => expect(harness.preferencePuts).toHaveLength(1), WAIT);
    await preferencesRead(harness);
    await act(async () => {});

    expect(harness.preferencePuts).toEqual([
      { response_language: toResponseLanguage("pt-BR") },
    ]);
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });

  it("does not seed once a value is stored: a second mount (other browser language) reads the write, applies it and PUTs nothing", async () => {
    const first = mount({ navigator: "pt-BR" });
    await waitFor(
      () => expect(first.harness.preferencePuts).toHaveLength(1),
      WAIT
    );
    await preferencesRead(first.harness);
    first.unmount();

    // Same fake BFF (the PUT merged into its stored preferences), new mount
    // from an English browser: applying the stored `pt` is a visible change.
    stubNavigatorLanguage("en-US");
    const { result, unmount } = mount({ harness: first.harness });
    expect(result.current.locale).toBe("en");
    await preferencesRead(first.harness, 2);

    expect(first.harness.preferencePuts).toHaveLength(1);
    expect(result.current.locale).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    unmount();
  });

  it("is not ready until the GET settles, and seeds nothing after an unmount", async () => {
    const { route, answer } = deferredGet();
    const { harness, result, unmount } = mount({
      navigator: "en-US",
      extraRoutes: route,
    });
    await waitFor(
      () => expect(harness.fetchMock).toHaveBeenCalledTimes(1),
      WAIT
    );
    expect(result.current.ready).toBe(false);

    unmount();
    await answer({});

    // Only the GET went out: an aborted mount never writes or logs.
    expect(harness.fetchMock).toHaveBeenCalledTimes(1);
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });

  // Hydration: the first client render is the server snapshot (`en`), so a
  // fast empty GET must seed from the browser, not from React state.
  it("seeds the browser's locale, not the server snapshot, when the empty GET lands during hydration", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_LOCALE", undefined);
    stubNavigatorLanguage("pt-BR");
    const harness = installFakeBff();

    function Probe() {
      const { locale } = useLocale();
      return <output data-testid="locale">{locale}</output>;
    }
    const ui = (
      <LocaleProvider>
        <LocalePreferenceProvider>
          <Probe />
        </LocalePreferenceProvider>
      </LocaleProvider>
    );

    const container = document.body.appendChild(document.createElement("div"));
    container.innerHTML = renderToString(ui);
    expect(within(container).getByTestId("locale")).toHaveTextContent("en");

    const recoverable: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, ui, {
          onRecoverableError: (e) => recoverable.push(e),
        });
      });
      await waitFor(() => expect(harness.preferencePuts).toHaveLength(1), WAIT);
      await preferencesRead(harness);

      expect(recoverable).toEqual([]);
      expect(harness.preferencePuts).toEqual([
        { response_language: toResponseLanguage("pt-BR") },
      ]);
      expect(within(container).getByTestId("locale")).toHaveTextContent(
        "pt-BR"
      );
      expect(document.documentElement.lang).toBe("pt-BR");
      expect(consoleSpy.error).not.toHaveBeenCalled();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });
});

describe("LocalePreferenceProvider — failures keep the browser locale", () => {
  it("GET returning 500 logs one console.error, applies nothing, PUTs nothing, and is ready", async () => {
    const { harness, result } = mount({
      navigator: "pt-BR",
      extraRoutes: { [PREFERENCES_ROUTE]: failed },
    });

    await waitFor(
      () => expect(consoleSpy.error).toHaveBeenCalledTimes(1),
      WAIT
    );
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

    await waitFor(
      () => expect(consoleSpy.error).toHaveBeenCalledTimes(1),
      WAIT
    );
    expect(result.current.locale).toBe("en");
    expect(result.current.ready).toBe(true);
  });

  it("a failed seed PUT was attempted once, logs one console.error and leaves the locale as the browser's", async () => {
    const { harness, result } = mount({
      navigator: "pt-BR",
      preferencePutResponse: failed,
    });

    await waitFor(
      () => expect(consoleSpy.error).toHaveBeenCalledTimes(1),
      WAIT
    );
    expect(harness.preferencePuts).toEqual([
      { response_language: toResponseLanguage("pt-BR") },
    ]);
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
  // pick and revert it (a stored value) or overwrite it (the first-visit
  // seed). `choose` supersedes the load.
  it.each<[string, unknown]>([
    ["a stored value", { response_language: "en" }],
    ["nothing stored (no seed PUT follows)", {}],
  ])(
    "wins over a load still in flight whose late GET delivers %s",
    async (_label, lateBody) => {
      const { route, answer } = deferredGet();
      const { harness, result } = mount({
        navigator: "en-US",
        extraRoutes: route,
      });
      await waitFor(
        () => expect(harness.fetchMock).toHaveBeenCalledTimes(1),
        WAIT
      );
      expect(result.current.ready).toBe(false);

      await act(() => result.current.choose("pt-BR"));
      expect(result.current.locale).toBe("pt-BR");
      expect(result.current.ready).toBe(true);

      await answer(lateBody);

      expect(result.current.locale).toBe("pt-BR");
      expect(document.documentElement.lang).toBe("pt-BR");
      // The pick's PUT is the only write; the superseded load logged nothing.
      const puts = putCalls(harness);
      expect(puts).toHaveLength(1);
      expect(JSON.parse(String(puts[0][1]?.body))).toEqual({
        response_language: toResponseLanguage("pt-BR"),
      });
      expect(consoleSpy.error).not.toHaveBeenCalled();
    }
  );

  it("resolves, logs one console.error and keeps the current locale when the PUT fails", async () => {
    const { harness, result } = mount({
      navigator: "en-US",
      storedPreferences: { response_language: "en" },
      preferencePutResponse: failed,
    });
    await preferencesRead(harness);

    await act(() => result.current.choose("pt-BR"));

    expect(harness.preferencePuts).toHaveLength(1);
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
      preferencePutResponse: () => new Response("nope", { status: 502 }),
    });

    await expect(saveLocalePreference("pt-BR")).rejects.toThrow(/502/);
  });
});
