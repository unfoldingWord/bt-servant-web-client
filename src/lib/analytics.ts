"use client";

import posthog, { type CaptureResult } from "posthog-js";

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
 * URLs: `/chat` accepts `?intent=` straight from the address bar, so any
 * captured URL is user-controlled text. `scrubEvent` strips the query string
 * and hash from every URL property PostHog attaches (pageviews, `$set_once`
 * initial URLs, replay page metadata) before anything leaves the browser.
 *
 * Identity, deliberately: we do NOT call `posthog.identify()` yet. The only
 * stable id the browser has is the raw email (`session.user.id`), and sending
 * that would break the pseudonymous posture the engine-side telemetry keeps.
 * Unifying a browser visitor with their engine turns needs a server-computed
 * HMAC pseudonym that matches the tail worker's `user_hash` — a follow-up.
 * Until then events are anonymous, which PostHog also bills at a fraction of
 * identified events.
 */

type QueuedEvent = { event: string; properties?: Record<string, unknown> };

/** Bound on events buffered before `initAnalytics` settles. */
const MAX_PRE_INIT_QUEUE = 20;

let initialized = false;
/** True once `initAnalytics` has decided whether analytics is on or off. */
let settled = false;
/**
 * Events tracked before init. React runs child effects before parent effects,
 * so a `track()` in a page component fires before `AnalyticsProvider` has
 * called `initAnalytics`; without this buffer those events are lost.
 */
let preInitQueue: QueuedEvent[] = [];

const URL_PROPERTY_KEYS = [
  "$current_url",
  "$initial_current_url",
  "$referrer",
  "$initial_referrer",
  "$session_entry_url",
  "$client_session_initial_url",
] as const;

/** Drops the query string and hash. Non-URL strings come back untouched. */
export function scrubUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function scrubUrlProps(props: Record<string, unknown> | undefined): void {
  if (!props) return;
  for (const key of URL_PROPERTY_KEYS) {
    const value = props[key];
    if (typeof value === "string") props[key] = scrubUrl(value);
  }
}

/**
 * `before_send` hook: sanitize every outgoing event in place. Exported so the
 * scrubbing rules are unit-testable without booting the SDK.
 */
export function scrubEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  scrubUrlProps(event.properties);
  scrubUrlProps(event.$set);
  scrubUrlProps(event.$set_once);
  scrubUrlProps(
    event.properties?.$set_once as Record<string, unknown> | undefined
  );
  scrubUrlProps(event.properties?.$set as Record<string, unknown> | undefined);

  // Session replay: rrweb Meta events (type 4) carry the page href.
  const snapshots = event.properties?.$snapshot_data;
  if (Array.isArray(snapshots)) {
    for (const snap of snapshots) {
      const data = (snap as { type?: number; data?: { href?: unknown } })?.data;
      if (
        (snap as { type?: number })?.type === 4 &&
        data &&
        typeof data.href === "string"
      ) {
        data.href = scrubUrl(data.href);
      }
    }
  }
  return event;
}

export function initAnalytics(): void {
  if (settled || typeof window === "undefined") return;
  settled = true;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    // unset => analytics off; deploys stay safe before secrets land
    preInitQueue = [];
    return;
  }
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
    // Strip query strings/hashes from every captured URL (see header comment).
    before_send: scrubEvent,
  });
  initialized = true;

  const queued = preInitQueue;
  preInitQueue = [];
  for (const { event, properties } of queued) {
    posthog.capture(event, properties);
  }
}

/**
 * Fire-and-forget. Safe to call before init (the event is buffered and sent
 * once `initAnalytics` runs) or with analytics disabled (dropped).
 */
export function track(
  event: string,
  properties?: Record<string, unknown>
): void {
  if (initialized) {
    posthog.capture(event, properties);
    return;
  }
  if (settled) return; // analytics is off for this build
  if (preInitQueue.length >= MAX_PRE_INIT_QUEUE) preInitQueue.shift();
  preInitQueue.push({ event, properties });
}
