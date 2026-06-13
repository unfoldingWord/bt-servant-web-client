import { getCloudflareContext } from "@opennextjs/cloudflare";

const DEFAULT_ORG_FALLBACK = "unfoldingWord";

function getDefaultOrg(): string {
  return process.env.DEFAULT_ORG || DEFAULT_ORG_FALLBACK;
}

// CHAT_ORG_KV (email → org) is the source of truth for a user's org. New users
// are auto-provisioned with DEFAULT_ORG on first sign-in; partner-specific
// users get their value set out-of-band via `wrangler kv:key put` or the
// Cloudflare dashboard. See docs/maintenance.md for the override procedure.

export async function resolveOrgForEmail(email: string): Promise<string> {
  const { env } = getCloudflareContext();
  const stored = await env.CHAT_ORG_KV.get(email);
  return stored ?? getDefaultOrg();
}

// Write email → DEFAULT_ORG only if absent. Idempotent: re-running on an
// already-provisioned email (including one set to a non-default partner org)
// is a no-op so manual overrides survive subsequent sign-ins.
export async function provisionOrgForEmail(email: string): Promise<void> {
  const { env } = getCloudflareContext();
  const existing = await env.CHAT_ORG_KV.get(email);
  if (existing != null) {
    return;
  }
  await env.CHAT_ORG_KV.put(email, getDefaultOrg());
}
