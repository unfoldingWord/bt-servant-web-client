"use client";

import posthog from "posthog-js";

/**
 * Thin seam over PostHog for the web client. Everything else imports `track`
 * and never the vendor, so swapping or disabling analytics is a one-file change.
 *
 * Session replay is ON in production only, gated by a build-time flag that
 * only the production deploy workflow sets. Recordings mask ALL text and all
 * inputs: they show navigation, clicks, scrolling and where people stall, but
 * never what was said. Unmasking text is the open conversation-content
 * decision and must not be flipped here without that call being made.
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
  const replay = process.env.NEXT_PUBLIC_POSTHOG_SESSION_REPLAY === "true";
  posthog.init(key, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    // A chat UI is full of user-typed and model-generated text. Never let the
    // SDK vacuum it up: no autocapture, everything masked.
    autocapture: false,
    // Replay: production only (the flag is set solely by the prod deploy build).
    // Even then every input and every piece of text is masked in the recording
    // itself, so no conversation content leaves the browser.
    disable_session_recording: !replay,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
    },
    // Console logs can carry error bodies; never ship them with recordings.
    enable_recording_console_log: false,
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
