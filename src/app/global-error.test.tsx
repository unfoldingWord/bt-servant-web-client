import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en, ptBR } from "@/test/copy";
import GlobalError from "./global-error";

// The route renders its own <html> root because global-error replaces the
// root layout, so it is rendered into the document itself (never into RTL's
// <div> container, which React 19 rejects as invalid nesting). React treats
// <html> as a host singleton and applies its props to
// document.documentElement, which is what the lang assertion reads.
function renderGlobalError(reset: () => void = () => {}) {
  return render(<GlobalError error={new Error("boom")} reset={reset} />, {
    container: document,
  });
}

describe("GlobalError", () => {
  it("renders the fallback heading and a reset button", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_LOCALE", undefined);
    const reset = vi.fn();
    renderGlobalError(reset);

    expect(
      screen.getByRole("heading", { name: en["globalError.heading"] })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: en["globalError.retry"] })
    );
    expect(reset).toHaveBeenCalledTimes(1);
  });

  // global-error replaces the root layout (and with it the LocaleProvider),
  // so it renders the initial locale itself: the env pin when staging sets
  // one, the default otherwise, declared on its own <html> root.
  it("renders an <html> root whose lang is the default locale", () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_LOCALE", undefined);
    // A stale value on the document root before render. React 19 treats the
    // route's <html> as a host singleton: acquiring document.documentElement
    // strips attributes it does not own and applies the element's own props.
    // So lang="en" afterwards means the route rendered an <html> that set it
    // — a component that dropped the <html> wrapper would leave "xx" in place.
    document.documentElement.setAttribute("lang", "xx");
    renderGlobalError();

    expect(
      screen.getByRole("heading", { name: en["globalError.heading"] })
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "en");
  });

  it("honors the NEXT_PUBLIC_DEFAULT_LOCALE pin for both copy and lang", () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_LOCALE", "pt-BR");
    renderGlobalError();

    expect(
      screen.getByRole("heading", { name: ptBR["globalError.heading"] })
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "pt-BR");
  });
});
