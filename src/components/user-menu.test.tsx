import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider } from "@/i18n";
import { consoleSpy } from "@/test/console";
import { LOCALES, SUPPORTED_LOCALES, type Locale } from "@/test/copy";
import { installFakeBff, type FakeBffOptions } from "@/test/fake-bff";
import { stubNavigatorLanguage } from "@/test/navigator";
import { UserMenu } from "./user-menu";

// The menu is rendered under the real LocaleProvider with the locale seeded
// from navigator.language, as in the app. Only fetch is stubbed: the fake BFF
// answers next-auth's csrf fetch and records `PUT /api/preferences`.

const PREFERENCES = "/api/preferences";
const codeFor = (locale: Locale) => LOCALES[locale].primaries[0];

afterEach(() => {
  document.documentElement.lang = "";
});

async function renderMenu(locale: Locale, bff: FakeBffOptions = {}) {
  stubNavigatorLanguage(locale);
  const harness = installFakeBff(bff);
  render(
    <LocaleProvider>
      <UserMenu userInitial="S" />
    </LocaleProvider>
  );
  await harness.bodyConsumed("/api/auth/csrf");
  return harness;
}

/** Opens the menu (it closes itself after every selection). */
async function openMenu(user: ReturnType<typeof userEvent.setup>, dict: Dict) {
  await user.click(
    screen.getByRole("button", { name: dict["userMenu.trigger"] })
  );
  return screen.findByRole("menu");
}

type Dict = (typeof LOCALES)[Locale]["dictionary"];

describe.each(SUPPORTED_LOCALES)("UserMenu [%s]", (locale) => {
  const dict = LOCALES[locale].dictionary;
  const other = SUPPORTED_LOCALES.find((l) => l !== locale)!;
  const otherDict = LOCALES[other].dictionary;

  it("lists every supported locale by native name under the localized Language label, with the current one checked", async () => {
    await renderMenu(locale);
    const user = userEvent.setup();

    await openMenu(user, dict);

    expect(screen.getByText(dict["userMenu.language"])).toBeInTheDocument();
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((el) => el.textContent)).toEqual(
      SUPPORTED_LOCALES.map((l) => LOCALES[l].displayName)
    );
    expect(
      screen.getByRole("menuitemradio", { checked: true })
    ).toHaveTextContent(LOCALES[locale].displayName);
    // The sign-out action is still there, localized.
    expect(
      screen.getByRole("menuitem", {
        name: new RegExp(dict["userMenu.signOut"]),
      })
    ).toBeInTheDocument();
  });

  it(`selecting ${LOCALES[other].displayName} PUTs its ISO 639-1 code, then re-renders in that locale with no reload`, async () => {
    const harness = await renderMenu(locale);
    const user = userEvent.setup();

    await openMenu(user, dict);
    await user.click(
      screen.getByRole("menuitemradio", { name: LOCALES[other].displayName })
    );

    await waitFor(() =>
      expect(harness.preferencePuts).toEqual([
        { response_language: codeFor(other) },
      ])
    );
    // The chrome follows: the trigger's label and <html lang> are now the
    // other locale's, and reopening shows the other item checked.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: otherDict["userMenu.trigger"] })
      ).toBeInTheDocument()
    );
    expect(document.documentElement.lang).toBe(other);
    await openMenu(user, otherDict);
    expect(
      screen.getByText(otherDict["userMenu.language"])
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { checked: true })
    ).toHaveTextContent(LOCALES[other].displayName);
    // No navigation happened: the csrf fetch that runs on mount ran once.
    expect(
      harness.fetchMock.mock.calls.filter(([u]) =>
        String(u).includes("/api/auth/csrf")
      )
    ).toHaveLength(1);
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });

  it("re-selecting the current locale issues no PUT", async () => {
    const harness = await renderMenu(locale);
    const user = userEvent.setup();

    await openMenu(user, dict);
    await user.click(
      screen.getByRole("menuitemradio", { name: LOCALES[locale].displayName })
    );
    await act(async () => {});

    expect(harness.preferencePuts).toEqual([]);
  });

  it("keeps the current locale and logs one console.error when the PUT fails", async () => {
    await renderMenu(locale, {
      extraRoutes: {
        [PREFERENCES]: () => new Response("boom", { status: 500 }),
      },
    });
    const user = userEvent.setup();

    await openMenu(user, dict);
    await user.click(
      screen.getByRole("menuitemradio", { name: LOCALES[other].displayName })
    );

    await waitFor(() => expect(consoleSpy.error).toHaveBeenCalledTimes(1));
    expect(consoleSpy.error.mock.calls[0][0]).toMatch(/UserMenu/);
    expect(document.documentElement.lang).toBe(locale);
    expect(
      screen.getByRole("button", { name: dict["userMenu.trigger"] })
    ).toBeInTheDocument();
  });
});
