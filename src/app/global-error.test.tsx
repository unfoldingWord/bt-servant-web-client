import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GLOBAL_ERROR_HEADING, GLOBAL_ERROR_RETRY } from "@/test/copy";
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
    const reset = vi.fn();
    renderGlobalError(reset);

    expect(
      screen.getByRole("heading", { name: GLOBAL_ERROR_HEADING })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: GLOBAL_ERROR_RETRY })
    );
    expect(reset).toHaveBeenCalledTimes(1);
  });

  // The route renders its own <html> root because global-error replaces the
  // root layout (and with it the LocaleProvider). The root therefore carries
  // the fallback locale explicitly rather than none at all.
  it("renders an <html> root whose lang is the fallback locale", () => {
    // A stale value on the document root before render. React 19 treats the
    // route's <html> as a host singleton: acquiring document.documentElement
    // strips attributes it does not own and applies the element's own props.
    // So lang="en" afterwards means the route rendered an <html> that set it
    // — a component that dropped the <html> wrapper would leave "xx" in place.
    document.documentElement.setAttribute("lang", "xx");
    renderGlobalError();

    expect(
      screen.getByRole("heading", { name: GLOBAL_ERROR_HEADING })
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "en");
  });
});
