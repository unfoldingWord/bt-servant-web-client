"use client";

import { LogOutIcon, BuildingIcon } from "lucide-react";
import { getCsrfToken } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatContext } from "@/components/providers/assistant-provider";

interface UserMenuProps {
  userInitial: string;
}

export function UserMenu({ userInitial }: UserMenuProps) {
  const [csrfToken, setCsrfToken] = useState<string>("");
  const { org, setOrg } = useChatContext();
  const [orgDraft, setOrgDraft] = useState(org);

  useEffect(() => {
    getCsrfToken().then((token) => setCsrfToken(token || ""));
  }, []);

  // Keep draft in sync when org changes externally
  useEffect(() => {
    setOrgDraft(org);
  }, [org]);

  const commitOrg = () => {
    const trimmed = orgDraft.trim();
    if (trimmed && trimmed !== org) {
      setOrg(trimmed);
    }
  };

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
        <div className="px-2 py-2">
          <label className="flex items-center gap-2 text-xs font-medium text-[#6b6a68] dark:text-[#9a9893]">
            <BuildingIcon className="h-3.5 w-3.5" />
            Organization
          </label>
          <input
            type="text"
            value={orgDraft}
            onChange={(e) => setOrgDraft(e.target.value)}
            onBlur={commitOrg}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitOrg();
                e.currentTarget.blur();
              }
            }}
            className="mt-1 w-full rounded-md border border-[#00000015] bg-[#f5f5f0] px-2 py-1.5 text-sm text-[#1a1a18] outline-none focus:border-[#ae5630] focus:ring-1 focus:ring-[#ae5630] dark:border-[#6c6a6040] dark:bg-[#393937] dark:text-[#eee]"
          />
        </div>
        <DropdownMenuSeparator className="bg-[#00000010] dark:bg-[#6c6a6030]" />
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
