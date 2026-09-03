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

  // Today the root carries no `lang` attribute. This pins the current state
  // so the i18n PR flips it deliberately (to the fallback locale) rather
  // than by accident.
  it("renders an <html> root that currently has no lang attribute", () => {
    renderGlobalError();

    expect(document.documentElement).not.toHaveAttribute("lang");
  });
});
