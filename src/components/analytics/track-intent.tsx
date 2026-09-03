"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/**
 * www.btservant.ai links to /chat?intent=<key>. Nothing read that param
 * before, so the marketing→chat funnel was invisible. Record it once per
 * page load; the value is a bounded key from the site's own CHANNELS map.
 */
export function TrackIntent({ intent }: { intent: string | undefined }) {
  useEffect(() => {
    if (intent) track("chat_opened_with_intent", { intent });
  }, [intent]);
  return null;
}
