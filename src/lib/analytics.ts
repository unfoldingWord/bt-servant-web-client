"use client";

import posthog from "posthog-js";

/**
 * Thin seam over PostHog for the web client. Everything else imports `track`
 * and never the vendor, so swapping or disabling analytics is a one-file change.
 *
 * Identity, deliberately: we do NOT call `posthog.identify()` yet. The only
 * stable id the browser has is the raw email (`session.user.id`), and sending
 * that would break the pseudonymous posture the engine-side telemetry keeps.
 * Unifying a browser visitor with their engine turns needs a server-computed
 * HMAC pseudonym that matches the tail worker's `user_hash` — a follow-up.
 * Until then events are anonymous, which PostHog also bills at a fraction of
 * identified events.
 */

let initialized = false;

export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return; // unset => analytics off; deploys stay safe before secrets land
  posthog.init(key, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    // A chat UI is full of user-typed and model-generated text. Never let the
    // SDK vacuum it up: no autocapture, no session replay, mask everything.
    autocapture: false,
    disable_session_recording: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    capture_pageview: true,
    capture_pageleave: true,
    person_profiles: "identified_only",
  });
  initialized = true;
}

/** Fire-and-forget. Safe to call before init or with analytics disabled. */
export function track(
  event: string,
  properties?: Record<string, unknown>
): void {
  if (!initialized) return;
  posthog.capture(event, properties);
}
