"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";
import type { IntentKey } from "@/lib/intent";

/**
 * www.btservant.ai links to /chat?intent=<key>. Nothing read that param
 * before, so the marketing→chat funnel was invisible. Record it once per
 * page load. The page validates the raw query value against `INTENT_KEYS`
 * before it gets here, so only a bounded key can ever be sent.
 *
 * This effect runs before `AnalyticsProvider`'s init effect (React runs child
 * effects first); `track` buffers pre-init events so the event is not lost.
 */
export function TrackIntent({ intent }: { intent: IntentKey | undefined }) {
  useEffect(() => {
    if (intent) track("chat_opened_with_intent", { intent });
  }, [intent]);
  return null;
}
