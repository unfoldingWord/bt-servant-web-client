"use client";

import { LogOutIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
  userInitial: string;
  onSignOut: () => void;
}

export function UserMenu({ userInitial, onSignOut }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#DDD9CE] text-sm font-semibold text-[#1a1a18] transition-all hover:bg-[#d0ccc0] focus:ring-2 focus:ring-[#ae5630] focus:ring-offset-2 focus:outline-none dark:bg-[#393937] dark:text-[#eee] dark:hover:bg-[#4a4a47]"
          aria-label="User menu"
        >
          {userInitial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 border-[#00000015] bg-white shadow-lg dark:border-[#6c6a6040] dark:bg-[#1f1e1b]"
      >
        <DropdownMenuItem
          onClick={onSignOut}
          className="cursor-pointer text-[#1a1a18] focus:bg-[#f5f5f0] focus:text-[#1a1a18] dark:text-[#eee] dark:focus:bg-[#393937] dark:focus:text-[#eee]"
        >
          <LogOutIcon className="mr-3 h-4 w-4 text-[#6b6a68] dark:text-[#9a9893]" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Sign out</span>
            <span className="text-xs text-[#6b6a68] dark:text-[#9a9893]">
              End your current session
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
