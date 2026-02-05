"use client";

import { LogOutIcon } from "lucide-react";
import { getCsrfToken } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
  userInitial: string;
}

export function UserMenu({ userInitial }: UserMenuProps) {
  const [csrfToken, setCsrfToken] = useState<string>("");

  useEffect(() => {
    getCsrfToken().then((token) => setCsrfToken(token || ""));
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ae5630] text-sm font-semibold text-white transition-all hover:bg-[#c4633a] focus:ring-2 focus:ring-[#ae5630] focus:ring-offset-2 focus:outline-none"
          aria-label="User menu"
        >
          {userInitial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 border-[#00000015] bg-white shadow-lg dark:border-[#6c6a6040] dark:bg-[#1f1e1b]"
      >
        <form action="/api/auth/signout" method="POST">
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="callbackUrl" value="/login" />
          <DropdownMenuItem
            asChild
            className="cursor-pointer text-[#1a1a18] focus:bg-[#f5f5f0] focus:text-[#1a1a18] dark:text-[#eee] dark:focus:bg-[#393937] dark:focus:text-[#eee]"
          >
            <button type="submit" className="w-full">
              <LogOutIcon className="mr-3 h-4 w-4 text-[#6b6a68] dark:text-[#9a9893]" />
              <div className="flex flex-col items-start">
                <span className="text-sm font-semibold">Sign out</span>
                <span className="text-xs text-[#6b6a68] dark:text-[#9a9893]">
                  End your current session
                </span>
              </div>
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
