"use client";

import { LanguagesIcon, LogOutIcon } from "lucide-react";
import { getCsrfToken } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatContext } from "@/components/providers/assistant-provider";
import { useLocalePreference } from "@/components/providers/locale-preference-provider";
import { LOCALES, SUPPORTED_LOCALES, useT } from "@/i18n";

interface UserMenuProps {
  userInitial: string;
}

const ITEM_CLASS =
  "cursor-pointer text-[#1a1a18] focus:bg-[#f5f5f0] focus:text-[#1a1a18] dark:text-[#eee] dark:focus:bg-[#393937] dark:focus:text-[#eee]";

export function UserMenu({ userInitial }: UserMenuProps) {
  const [csrfToken, setCsrfToken] = useState<string>("");
  const { locale, choose } = useLocalePreference();
  // Never flip the locale under an animating reply: the picker is locked
  // while a reply is in flight and says so.
  const { isLoading: languageLocked } = useChatContext();
  const t = useT();

  useEffect(() => {
    getCsrfToken().then((token) => setCsrfToken(token || ""));
  }, []);

  // The provider persists first, then switches the chrome, so the interface
  // and the reply language never disagree; on failure it logs and the radio
  // (controlled by `locale`) snaps back.
  const selectLocale = (value: string) => {
    const next = SUPPORTED_LOCALES.find((l) => l === value);
    if (!next || next === locale) return;
    void choose(next);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ae5630] text-sm font-semibold text-white transition-all hover:bg-[#c4633a] focus:ring-2 focus:ring-[#ae5630] focus:ring-offset-2 focus:outline-none"
          aria-label={t("userMenu.trigger")}
        >
          {userInitial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 border-[#00000015] bg-white shadow-lg dark:border-[#6c6a6040] dark:bg-[#1f1e1b]"
      >
        <DropdownMenuLabel className="flex items-center gap-3 text-xs font-medium text-[#6b6a68] dark:text-[#9a9893]">
          <LanguagesIcon className="h-4 w-4" />
          {t("userMenu.language")}
        </DropdownMenuLabel>
        {languageLocked && (
          <p className="px-2 pb-1 text-xs text-[#6b6a68] italic dark:text-[#9a9893]">
            {t("userMenu.languageLockedWhileReplying")}
          </p>
        )}
        <DropdownMenuRadioGroup value={locale} onValueChange={selectLocale}>
          {SUPPORTED_LOCALES.map((l) => (
            <DropdownMenuRadioItem
              key={l}
              value={l}
              disabled={languageLocked}
              className={`${ITEM_CLASS} text-sm`}
            >
              {LOCALES[l].displayName}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator className="bg-[#00000015] dark:bg-[#6c6a6040]" />
        <form action="/api/auth/signout" method="POST">
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="callbackUrl" value="/login" />
          <DropdownMenuItem asChild className={ITEM_CLASS}>
            <button type="submit" className="w-full">
              <LogOutIcon className="mr-3 h-4 w-4 text-[#6b6a68] dark:text-[#9a9893]" />
              <div className="flex flex-col items-start">
                <span className="text-sm font-semibold">
                  {t("userMenu.signOut")}
                </span>
                <span className="text-xs text-[#6b6a68] dark:text-[#9a9893]">
                  {t("userMenu.signOutDescription")}
                </span>
              </div>
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
