# Maintenance

Operational tasks that aren't part of the normal dev/build loop.

## Setting a user's org (CHAT_ORG_KV)

The chat web client looks up each authenticated user's org from
`CHAT_ORG_KV` (email → org) on every request. New users are
auto-provisioned with `DEFAULT_ORG` on their first sign-in. To put a
specific user in a non-default partner org, set the value manually.

### Via Wrangler

Production:

```bash
npx wrangler kv key put --binding=CHAT_ORG_KV --remote \
  user@example.com partner-org-slug
```

Staging:

```bash
npx wrangler kv key put --binding=CHAT_ORG_KV --remote --env staging \
  user@example.com partner-org-slug
```

Inspect:

```bash
npx wrangler kv key get --binding=CHAT_ORG_KV --remote user@example.com
npx wrangler kv key list --binding=CHAT_ORG_KV --remote | head
```

Delete (user reverts to `DEFAULT_ORG` on next request — but their KV
entry will be re-provisioned to `DEFAULT_ORG` on their next sign-in):

```bash
npx wrangler kv key delete --binding=CHAT_ORG_KV --remote user@example.com
```

### Via Cloudflare dashboard

1. Sign in to https://dash.cloudflare.com
2. Workers & Pages → KV
3. Pick the right namespace: `bt-servant-web-client-CHAT_ORG_KV` (prod) or
   `bt-servant-web-client-staging-CHAT_ORG_KV` (staging) — match the worker
   you're operating on
4. Search for the user's email
5. Edit the value to the partner org slug, save

## Pre-provisioning users

To put a user in a partner org _before_ they ever sign in, just write the
KV entry with their email. The first-sign-in auto-provision is a no-op when
a value already exists, so the partner-org binding survives.
