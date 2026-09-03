import { describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantProvider } from "@/components/providers/assistant-provider";
import { LocaleProvider } from "@/i18n";
import { consoleSpy } from "@/test/console";
import {
  LOCALES,
  SUPPORTED_LOCALES,
  toResponseLanguage,
  type Locale,
} from "@/test/copy";
import { installFakeBff, type FakeBffOptions } from "@/test/fake-bff";
import { stubNavigatorLanguage } from "@/test/navigator";
import { UserMenu } from "./user-menu";

// The menu is rendered as in the app: under the real LocaleProvider (locale
// seeded from navigator.language) and the real AssistantProvider, which owns
// the stored preference. Only fetch is stubbed. The user under test already
// has `locale` stored, so the mount-time load applies it and seeds nothing.
// The picker's lock while a reply streams is covered in thread.test.tsx,
// where a reply can be started.

const WAIT = { interval: 5 };

async function renderMenu(locale: Locale, bff: FakeBffOptions = {}) {
  stubNavigatorLanguage(locale);
  const harness = installFakeBff({
    storedPreferences: { response_language: toResponseLanguage(locale) },
    ...bff,
  });
  render(
    <LocaleProvider>
      <AssistantProvider>
        <UserMenu userInitial="S" />
      </AssistantProvider>
    </LocaleProvider>
  );
  await harness.bodyConsumed("/api/auth/csrf");
  await harness.historyLoaded();
  await harness.preferencesLoaded();
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

/** The first PUT answers only when the test says so; later PUTs at once. */
function deferredFirstPut() {
  let answer!: () => void;
  let calls = 0;
  const preferencePutResponse = () =>
    ++calls === 1
      ? new Promise<Response>(
          (r) => (answer = () => r(new Response("{}", { status: 200 })))
        )
      : new Response("{}", { status: 200 });
  return {
    preferencePutResponse,
    answerFirst: async () => {
      answer();
      await act(async () => {});
      await act(async () => {});
    },
  };
}

describe.each(SUPPORTED_LOCALES)("UserMenu [%s]", (locale) => {
  const dict = LOCALES[locale].dictionary;
  const other = SUPPORTED_LOCALES.find((l) => l !== locale)!;
  const otherDict = LOCALES[other].dictionary;

  it("lists every supported locale by native name under the localized Language label, with the current one checked and enabled", async () => {
    await renderMenu(locale);
    const user = userEvent.setup();

    await openMenu(user, dict);

    expect(screen.getByText(dict["userMenu.language"])).toBeInTheDocument();
    expect(
      screen.queryByText(dict["userMenu.languageLockedWhileReplying"])
    ).not.toBeInTheDocument();
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((el) => el.textContent)).toEqual(
      SUPPORTED_LOCALES.map((l) => LOCALES[l].displayName)
    );
    for (const item of items) expect(item).not.toHaveAttribute("aria-disabled");
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

    await waitFor(
      () =>
        expect(harness.preferencePuts).toEqual([
          { response_language: toResponseLanguage(other) },
        ]),
      WAIT
    );
    // The chrome follows: the trigger's label and <html lang> are now the
    // other locale's, and reopening shows the other item checked.
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: otherDict["userMenu.trigger"] })
        ).toBeInTheDocument(),
      WAIT
    );
    expect(document.documentElement.lang).toBe(other);
    await openMenu(user, otherDict);
    expect(
      screen.getByText(otherDict["userMenu.language"])
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { checked: true })
    ).toHaveTextContent(LOCALES[other].displayName);
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

  // Regression: the radio is bound to the pending pick, not the applied
  // locale. Bound to the applied locale, reselecting the original language
  // while the first PUT is still in flight is a no-op against the checked
  // item, and the language the user just cancelled lands anyway.
  it(`re-selecting ${LOCALES[locale].displayName} while the PUT for ${LOCALES[other].displayName} is in flight reverses the pick`, async () => {
    const { preferencePutResponse, answerFirst } = deferredFirstPut();
    const harness = await renderMenu(locale, { preferencePutResponse });
    const user = userEvent.setup();

    await openMenu(user, dict);
    await user.click(
      screen.getByRole("menuitemradio", { name: LOCALES[other].displayName })
    );
    await waitFor(() => expect(harness.preferencePuts).toHaveLength(1), WAIT);

    // In flight: the chrome has not moved, but the picker shows the pick.
    expect(document.documentElement.lang).toBe(locale);
    await openMenu(user, dict);
    expect(
      screen.getByRole("menuitemradio", { checked: true })
    ).toHaveTextContent(LOCALES[other].displayName);

    // The reversal is a real change against what the picker shows.
    await user.click(
      screen.getByRole("menuitemradio", { name: LOCALES[locale].displayName })
    );
    await answerFirst();

    await waitFor(
      () =>
        expect(harness.preferencePuts).toEqual([
          { response_language: toResponseLanguage(other) },
          { response_language: toResponseLanguage(locale) },
        ]),
      WAIT
    );
    expect(document.documentElement.lang).toBe(locale);
    expect(
      screen.getByRole("button", { name: dict["userMenu.trigger"] })
    ).toBeInTheDocument();
    await openMenu(user, dict);
    expect(
      screen.getByRole("menuitemradio", { checked: true })
    ).toHaveTextContent(LOCALES[locale].displayName);
    expect(consoleSpy.error).not.toHaveBeenCalled();
  });

  it("keeps the current locale and logs one console.error when the PUT fails", async () => {
    const harness = await renderMenu(locale, {
      preferencePutResponse: () => new Response("boom", { status: 500 }),
    });
    const user = userEvent.setup();

    await openMenu(user, dict);
    await user.click(
      screen.getByRole("menuitemradio", { name: LOCALES[other].displayName })
    );

    await waitFor(
      () => expect(consoleSpy.error).toHaveBeenCalledTimes(1),
      WAIT
    );
    expect(consoleSpy.error.mock.calls[0][0]).toMatch(
      /LocalePreferenceProvider/
    );
    expect(harness.preferencePuts).toHaveLength(1); // attempted once
    expect(document.documentElement.lang).toBe(locale);
    expect(
      screen.getByRole("button", { name: dict["userMenu.trigger"] })
    ).toBeInTheDocument();
  });
});
