import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider, useLocale, useT } from "./locale-provider";
import { en } from "./en";
import { ptBR } from "./pt-BR";

// jsdom exposes navigator.language as a prototype getter ("en-US"); an
// instance-level override shadows it and is removed again in afterEach.
function stubNavigatorLanguage(value: string) {
  Object.defineProperty(window.navigator, "language", {
    value,
    configurable: true,
  });
}

function restoreNavigatorLanguage() {
  delete (window.navigator as unknown as Record<string, unknown>).language;
}

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

function renderProbe() {
  return render(
    <LocaleProvider>
      <Probe />
    </LocaleProvider>
  );
}

afterEach(() => {
  restoreNavigatorLanguage();
  vi.unstubAllEnvs();
  document.documentElement.lang = "";
});

describe("LocaleProvider", () => {
  it("renders `en` on the server even when the browser would prefer pt-BR (hydration-safe)", () => {
    stubNavigatorLanguage("pt-BR");
    const markup = renderToStaticMarkup(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>
    );
    // Parse rather than string-match: renderToStaticMarkup escapes the
    // apostrophe in the English greeting.
    const host = document.createElement("div");
    host.innerHTML = markup;
    expect(host.querySelector('[data-testid="locale"]')?.textContent).toBe(
      "en"
    );
    expect(host.querySelector('[data-testid="welcome"]')?.textContent).toBe(
      en["thread.welcome"]
    );
  });

  it("stays `en` after mount when navigator.language is an English tag", async () => {
    stubNavigatorLanguage("en-US");
    renderProbe();
    await act(async () => {});
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(screen.getByTestId("welcome")).toHaveTextContent(
      en["thread.welcome"]
    );
    expect(document.documentElement.lang).toBe("en");
  });

  it("seeds pt-BR from navigator.language on mount", async () => {
    stubNavigatorLanguage("pt-BR");
    renderProbe();
    await act(async () => {});
    expect(screen.getByTestId("locale")).toHaveTextContent("pt-BR");
    expect(screen.getByTestId("welcome")).toHaveTextContent(
      ptBR["thread.welcome"]
    );
    expect(document.documentElement.lang).toBe("pt-BR");
  });

  it("normalizes a bare `pt` navigator tag to pt-BR and an unsupported tag to en", async () => {
    stubNavigatorLanguage("pt");
    const first = renderProbe();
    await act(async () => {});
    expect(screen.getByTestId("locale")).toHaveTextContent("pt-BR");
    first.unmount();

    stubNavigatorLanguage("es-MX");
    renderProbe();
    await act(async () => {});
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
  });

  it("prefers NEXT_PUBLIC_DEFAULT_LOCALE over navigator.language when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_LOCALE", "pt");
    stubNavigatorLanguage("en-US");
    const first = renderProbe();
    await act(async () => {});
    expect(screen.getByTestId("locale")).toHaveTextContent("pt-BR");
    first.unmount();

    vi.stubEnv("NEXT_PUBLIC_DEFAULT_LOCALE", "en");
    stubNavigatorLanguage("pt-BR");
    renderProbe();
    await act(async () => {});
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
  });

  it("keeps document.documentElement.lang in sync on every setLocale", async () => {
    stubNavigatorLanguage("en-US");
    renderProbe();
    await act(async () => {});
    expect(document.documentElement.lang).toBe("en");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "to-pt" }));
    expect(screen.getByTestId("locale")).toHaveTextContent("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");

    await user.click(screen.getByRole("button", { name: "to-en" }));
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("useLocale throws outside a LocaleProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/LocaleProvider/);
    spy.mockRestore();
  });
});
