"use client";

import { useEffect, useRef } from "react";
import {
  normalizeLocale,
  toResponseLanguage,
  useLocale,
  type Locale,
} from "@/i18n";
import type { UserPreferences } from "@/types/engine";

// One coupled setting: the interface locale and the model's reply language
// are the same preference, stored by the worker as `response_language`
// (ISO 639-1, e.g. `pt`) and proxied by the BFF at /api/preferences.

const PREFERENCES_URL = "/api/preferences";

async function readPreferences(signal: AbortSignal): Promise<UserPreferences> {
  const response = await fetch(PREFERENCES_URL, { signal });
  if (!response.ok) {
    throw new Error(`GET ${PREFERENCES_URL} failed (${response.status})`);
  }
  return response.json();
}

async function writePreferences(
  preferences: UserPreferences,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(PREFERENCES_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preferences),
    signal,
  });
  if (!response.ok) {
    throw new Error(`PUT ${PREFERENCES_URL} failed (${response.status})`);
  }
}

/**
 * Persists `locale` as the user's `response_language`. Rejects on failure so
 * the caller decides what the UI does (the user menu logs and keeps the
 * current locale).
 */
export function saveLocalePreference(locale: Locale): Promise<void> {
  return writePreferences({ response_language: toResponseLanguage(locale) });
}

/**
 * Syncs the interface locale with the stored preference once per mount, in
 * the authenticated area only (the BFF route needs a session):
 *
 * - stored `response_language` → `setLocale(normalizeLocale(it))`; an
 *   explicit choice beats the browser, an unsupported code falls back to the
 *   default locale for the chrome only.
 * - nothing stored (first visit on any device) → one `PUT` seeding the
 *   browser-derived locale, so it persists across devices. Only the mount
 *   whose `GET` came back empty writes, and an aborted mount never does, so
 *   there is exactly one write per user, not per visit or per render.
 * - any failure → `console.error` with context, locale left as the browser's.
 *
 * `paused` defers applying a loaded preference (never flip the locale while
 * a reply is streaming); the value is applied as soon as `paused` is false.
 */
export function usePreferredLocale({
  paused = false,
}: { paused?: boolean } = {}) {
  const { locale, setLocale } = useLocale();
  // Read at PUT time, not at mount: during hydration the provider may still
  // be on its server snapshot when this effect first runs, and the browser
  // locale only lands on the following render.
  const localeRef = useRef(locale);
  const pausedRef = useRef(paused);
  const pendingRef = useRef<Locale | null>(null);

  useEffect(() => {
    localeRef.current = locale;
    pausedRef.current = paused;
  }, [locale, paused]);

  // A preference that arrived while paused is applied once unpaused.
  useEffect(() => {
    if (paused || pendingRef.current === null) return;
    const next = pendingRef.current;
    pendingRef.current = null;
    setLocale(next);
  }, [paused, setLocale]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      try {
        const preferences = await readPreferences(signal);
        if (signal.aborted) return;

        if (preferences.response_language) {
          const preferred = normalizeLocale(preferences.response_language);
          if (pausedRef.current) pendingRef.current = preferred;
          else setLocale(preferred);
          return;
        }

        await writePreferences(
          { response_language: toResponseLanguage(localeRef.current) },
          signal
        );
      } catch (error) {
        // Unmounted mid-flight: nothing to apply, nothing to report.
        if (signal.aborted) return;
        console.error(
          "[usePreferredLocale] could not sync response_language; keeping the browser locale",
          { locale: localeRef.current, error }
        );
      }
    })();

    return () => controller.abort();
  }, [setLocale]);
}
