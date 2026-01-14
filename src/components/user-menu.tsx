"use client";

import { LogOutIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useState } from "react";

interface UserMenuProps {
  userInitial: string;
  userImage?: string | null;
  onSignOut: () => void;
}

function extractDominantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve("#ae5630"); // fallback
        return;
      }

      // Sample a small version for performance
      canvas.width = 10;
      canvas.height = 10;
      ctx.drawImage(img, 0, 0, 10, 10);

      const imageData = ctx.getImageData(0, 0, 10, 10).data;
      let r = 0,
        g = 0,
        b = 0,
        count = 0;

      // Average all pixels
      for (let i = 0; i < imageData.length; i += 4) {
        r += imageData[i];
        g += imageData[i + 1];
        b += imageData[i + 2];
        count++;
      }

      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);

      // Darken slightly for better contrast with white text
      r = Math.round(r * 0.8);
      g = Math.round(g * 0.8);
      b = Math.round(b * 0.8);

      resolve(`rgb(${r}, ${g}, ${b})`);
    };
    img.onerror = () => resolve("#ae5630"); // fallback
    img.src = imageUrl;
  });
}

export function UserMenu({ userInitial, userImage, onSignOut }: UserMenuProps) {
  const [bgColor, setBgColor] = useState("#ae5630");

  useEffect(() => {
    if (userImage) {
      extractDominantColor(userImage).then(setBgColor);
    }
  }, [userImage]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 focus:ring-2 focus:ring-[#ae5630] focus:ring-offset-2 focus:outline-none"
          style={{ backgroundColor: bgColor }}
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
