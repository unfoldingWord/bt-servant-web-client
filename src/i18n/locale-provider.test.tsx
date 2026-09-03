import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  document.documentElement.lang = "";
});

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

  it("hydrates the English server markup without a mismatch, then switches to the browser's pt-BR", async () => {
    stubEnv(undefined);
    stubNavigatorLanguage("pt-BR");

    const container = document.body.appendChild(document.createElement("div"));
    container.innerHTML = renderToString(ui);
    expect(within(container).getByTestId("locale")).toHaveTextContent("en");

    const recoverable: unknown[] = [];
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, ui, {
        onRecoverableError: (e) => recoverable.push(e),
      });
    });

    // No hydration mismatch was recovered from or logged...
    expect(recoverable).toEqual([]);
    expect(consoleSpy.error).not.toHaveBeenCalled();
    // ...and the post-hydration update applied the browser's language.
    expect(within(container).getByTestId("locale")).toHaveTextContent("pt-BR");
    expect(within(container).getByTestId("welcome")).toHaveTextContent(
      welcome("pt-BR")
    );
    expect(document.documentElement.lang).toBe("pt-BR");

    await act(async () => root.unmount());
    container.remove();
  });

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
