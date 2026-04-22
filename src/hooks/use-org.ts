"use client";

import { useSyncExternalStore, useCallback } from "react";
import { isValidOrg } from "@/lib/validate-org";

const STORAGE_KEY = "bt-org";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function subscribeNoop() {
  return () => {};
}

export function useOrg(defaultOrg: string, enabled: boolean = true) {
  const org = useSyncExternalStore(
    enabled ? subscribe : subscribeNoop,
    () =>
      enabled ? localStorage.getItem(STORAGE_KEY) || defaultOrg : defaultOrg,
    () => defaultOrg
  );

  const setOrg = useCallback(
    (value: string) => {
      if (!enabled) return;
      const trimmed = value.trim();
      if (trimmed && isValidOrg(trimmed)) {
        localStorage.setItem(STORAGE_KEY, trimmed);
        window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
      }
    },
    [enabled]
  );

  return { org, setOrg };
}
