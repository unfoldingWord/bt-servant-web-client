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
import { saveLocalePreference } from "@/hooks/use-preferred-locale";
import { LOCALES, SUPPORTED_LOCALES, useLocale, useT } from "@/i18n";

interface UserMenuProps {
  userInitial: string;
}

const ITEM_CLASS =
  "cursor-pointer text-[#1a1a18] focus:bg-[#f5f5f0] focus:text-[#1a1a18] dark:text-[#eee] dark:focus:bg-[#393937] dark:focus:text-[#eee]";

export function UserMenu({ userInitial }: UserMenuProps) {
  const [csrfToken, setCsrfToken] = useState<string>("");
  const { locale, setLocale } = useLocale();
  const t = useT();

  useEffect(() => {
    getCsrfToken().then((token) => setCsrfToken(token || ""));
  }, []);

  // One coupled setting: persist first, then switch the chrome, so the
  // interface and the reply language never disagree. On failure the radio
  // snaps back (it is controlled by `locale`) and the cause is logged.
  const selectLocale = async (value: string) => {
    const next = SUPPORTED_LOCALES.find((l) => l === value);
    if (!next || next === locale) return;
    try {
      await saveLocalePreference(next);
      setLocale(next);
    } catch (error) {
      console.error("[UserMenu] could not save the language preference", {
        locale: next,
        error,
      });
    }
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
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => void selectLocale(value)}
        >
          {SUPPORTED_LOCALES.map((l) => (
            <DropdownMenuRadioItem
              key={l}
              value={l}
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
