import { describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { consoleSpy } from "@/test/console";
import { stubNavigatorLanguage } from "@/test/navigator";
import { LocaleProvider, useLocale, useT } from "./locale-provider";
import { LOCALES, type Locale } from "./locales";

function Probe() {
  const { locale, setLocale } = useLocale();
  const t = useT();
  return (
    <div>
      <output data-testid="locale">{locale}</output>
      <output data-testid="welcome">{t("thread.welcome")}</output>
      <button type="button" onClick={() => setLocale("pt-BR")}>
        {"to-pt"}
      </button>
      <button type="button" onClick={() => setLocale("en")}>
        {"to-en"}
      </button>
    </div>
  );
}

const ui = (
  <LocaleProvider>
    <Probe />
  </LocaleProvider>
);

const welcome = (locale: Locale) =>
  LOCALES[locale].dictionary["thread.welcome"];

/** Parses SSR markup: renderToStaticMarkup escapes the apostrophe in the greeting. */
function parse(markup: string) {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return within(host);
}

function stubEnv(value: string | undefined) {
  vi.stubEnv("NEXT_PUBLIC_DEFAULT_LOCALE", value);
}

describe("LocaleProvider — server render", () => {
  it.each<[string | undefined, Locale]>([
    [undefined, "en"],
    ["pt-BR", "pt-BR"],
  ])(
    "NEXT_PUBLIC_DEFAULT_LOCALE=%j renders %s regardless of the browser (hydration-safe)",
    (env, expected) => {
      stubEnv(env);
      stubNavigatorLanguage(expected === "en" ? "pt-BR" : "en-US");
      const view = parse(renderToStaticMarkup(ui));
      expect(view.getByTestId("locale")).toHaveTextContent(expected);
      expect(view.getByTestId("welcome")).toHaveTextContent(welcome(expected));
    }
  );
});

describe("LocaleProvider — client seed", () => {
  it.each<[string | undefined, string, Locale]>([
    [undefined, "en-US", "en"],
    [undefined, "pt-BR", "pt-BR"],
    [undefined, "pt", "pt-BR"],
    [undefined, "es-MX", "en"],
    ["pt", "en-US", "pt-BR"],
    ["en", "pt-BR", "en"],
  ])(
    "env=%j navigator.language=%s → %s (env wins over the browser)",
    async (env, navLang, expected) => {
      stubEnv(env);
      stubNavigatorLanguage(navLang);
      render(ui);
      await act(async () => {});
      expect(screen.getByTestId("locale")).toHaveTextContent(expected);
      expect(screen.getByTestId("welcome")).toHaveTextContent(
        welcome(expected)
      );
      expect(document.documentElement.lang).toBe(expected);
    }
  );

  // Real hydration of real server markup, on both seed paths: no pin (the
  // browser's language takes over after hydration) and a pin (the browser is
  // ignored, both sides agree up front).
  it.each<[string | undefined, string, Locale, Locale]>([
    [undefined, "pt-BR", "en", "pt-BR"],
    ["pt-BR", "en-US", "pt-BR", "pt-BR"],
  ])(
    "env=%j navigator.language=%s: hydrates %s markup without a mismatch, then shows %s",
    async (env, navLang, ssrLocale, finalLocale) => {
      stubEnv(env);
      stubNavigatorLanguage(navLang);

      const container = document.body.appendChild(
        document.createElement("div")
      );
      container.innerHTML = renderToString(ui);
      expect(within(container).getByTestId("locale")).toHaveTextContent(
        ssrLocale
      );

      const recoverable: unknown[] = [];
      let root: ReturnType<typeof hydrateRoot> | undefined;
      try {
        await act(async () => {
          root = hydrateRoot(container, ui, {
            onRecoverableError: (e) => recoverable.push(e),
          });
        });

        // No hydration mismatch was recovered from or logged...
        expect(recoverable).toEqual([]);
        expect(consoleSpy.error).not.toHaveBeenCalled();
        // ...and the post-hydration state is the expected locale.
        expect(within(container).getByTestId("locale")).toHaveTextContent(
          finalLocale
        );
        expect(within(container).getByTestId("welcome")).toHaveTextContent(
          welcome(finalLocale)
        );
        expect(document.documentElement.lang).toBe(finalLocale);
      } finally {
        await act(async () => root?.unmount());
        container.remove();
      }
    }
  );

  it("keeps document.documentElement.lang in sync on every setLocale", async () => {
    stubEnv(undefined);
    stubNavigatorLanguage("en-US");
    render(ui);
    await act(async () => {});
    expect(document.documentElement.lang).toBe("en");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "to-pt" }));
    expect(screen.getByTestId("locale")).toHaveTextContent("pt-BR");
    expect(screen.getByTestId("welcome")).toHaveTextContent(welcome("pt-BR"));
    expect(document.documentElement.lang).toBe("pt-BR");

    await user.click(screen.getByRole("button", { name: "to-en" }));
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("useLocale throws outside a LocaleProvider", () => {
    expect(() => render(<Probe />)).toThrow(/LocaleProvider/);
  });
});
