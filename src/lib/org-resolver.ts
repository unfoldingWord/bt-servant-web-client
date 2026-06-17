import { getCloudflareContext } from "@opennextjs/cloudflare";

const DEFAULT_ORG_FALLBACK = "unfoldingWord";

// Orgs are URL-encoded before being interpolated into upstream paths
// (see `src/lib/engine-client.ts`). The pattern here is a sanity gate
// against a stray KV write — empty string, path-traversal nonsense,
// control characters — not a strict slug check. Real org names in
// staging include spaces (e.g. "Bible Society of Jordan",
// "Test Organization") so spaces are explicitly allowed.
const ORG_PATTERN = /^[a-zA-Z0-9 _-]{1,100}$/;

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
  if (stored != null && !ORG_PATTERN.test(stored)) {
    console.warn(
      "[org-resolver] CHAT_ORG_KV holds an invalid org slug; falling back to default",
      {
        email,
        stored,
      }
    );
    return getDefaultOrg();
  }
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
