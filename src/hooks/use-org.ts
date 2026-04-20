"use client";

import { useSyncExternalStore, useCallback } from "react";

const STORAGE_KEY = "bt-org";
const DEFAULT_ORG = "unfoldingWord";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_ORG;
}

function getServerSnapshot() {
  return DEFAULT_ORG;
}

export function useOrg() {
  const org = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setOrg = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    }
  }, []);

  return { org, setOrg };
}
