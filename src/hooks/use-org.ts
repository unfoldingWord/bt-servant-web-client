"use client";

import { useSyncExternalStore, useCallback } from "react";
import { isValidOrg } from "@/lib/validate-org";

const STORAGE_KEY = "bt-org";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function useOrg(defaultOrg: string) {
  const org = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(STORAGE_KEY) || defaultOrg,
    () => defaultOrg
  );

  const setOrg = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed && isValidOrg(trimmed)) {
      localStorage.setItem(STORAGE_KEY, trimmed);
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    }
  }, []);

  return { org, setOrg };
}
