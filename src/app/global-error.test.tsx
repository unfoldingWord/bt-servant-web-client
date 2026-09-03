import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import GlobalError from "./global-error";

describe("GlobalError", () => {
  it("renders the fallback heading and a reset button", async () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error("boom")} reset={reset} />);

    expect(
      screen.getByRole("heading", { name: "Something went wrong." })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  // The route renders its own <html> root because global-error replaces the
  // root layout. Today that root carries no `lang` attribute. This assertion
  // pins the current state so the i18n PR flips it deliberately (to the
  // fallback locale) rather than by accident.
  it("renders an <html> root that currently has no lang attribute", () => {
    const markup = renderToStaticMarkup(
      <GlobalError error={new Error("boom")} reset={() => {}} />
    );

    expect(markup.startsWith("<html>")).toBe(true);
    expect(markup).not.toMatch(/<html[^>]*\slang=/);
  });
});
