/**
 * Marketing-site intents. www.btservant.ai links to `/chat?intent=<key>`
 * where `<key>` is one of the INTENTS map keys in bt-servant-site
 * (`assets/js/main.js`). Anything else in that query param is user-controlled
 * text and must never reach analytics.
 */
export const INTENT_KEYS = [
  "understand",
  "study",
  "translate",
  "teach",
  "share",
  "equip",
] as const;

export type IntentKey = (typeof INTENT_KEYS)[number];

/** Returns the intent only if it is one of the known marketing keys. */
export function parseIntent(raw: unknown): IntentKey | undefined {
  if (typeof raw !== "string") return undefined;
  return (INTENT_KEYS as readonly string[]).includes(raw)
    ? (raw as IntentKey)
    : undefined;
}
