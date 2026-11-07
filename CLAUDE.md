# CLAUDE.md

## CRITICAL: Branching Model (develop → main)

Two long-lived branches:

- **`develop`** is the integration branch and the default branch. Every
  feature branch and every PR targets `develop`. Staging deploys automatically
  after CI passes on a push to `develop`. Bot review plus CI is enough to
  merge there.
- **`main`** is the release branch. It only ever receives `develop` (a release
  PR, "Release vX.Y.Z: develop → main") or a `hotfix/*` branch. Only the repo
  owner can merge to `main` (branch protection restricts pushes and requires a
  code-owner review). Production deploys from `main` by tag.
- **Rule: `develop` is always releasable.** Work that is not ready to ship
  stays on its feature branch, or merges behind a flag that is off in
  production. Never cherry-pick into `main`; if something on `develop` must not
  ship, revert it on `develop` or flag it off, then release.
- **Hotfix:** branch from `main` as `hotfix/<name>`, PR into `main`, then open
  a PR from `main` into `develop` the same day so `develop` stays ahead of
  `main`.
- **Release:** merge the release PR, tag `v<version>` on the resulting `main`
  commit, then dispatch the production deploy on that tag:
  `gh workflow run deploy-cloudflare.yml --ref v<version>`.
- **Merge methods:** feature PRs into `develop` are **squash**-merged
  (`develop` requires linear history). Release and hotfix PRs into `main` use a
  **merge commit**, never squash or rebase. A squash would copy `develop`'s
  work into a new commit that `develop` never contains, so the branches would
  diverge and every later release PR would re-list already-shipped commits.
  With merge commits, the next release PR shows only what is new, and
  `git log --first-parent main` lists one commit per release. Never delete
  `develop` when merging a release PR.
- **Up to date before merge:** `develop` requires a PR branch to be current
  with `develop` before it merges (use "Update branch"), so two PRs that pass
  alone cannot break together. `main` does not, because `develop` never
  contains `main`'s release merge commits.

CI's `Release Source` job refuses a PR into `main` from any other branch. The
production deploy (`deploy-cloudflare.yml`) refuses to run on anything but a
`v*` tag that is on `main`. `src/lib/workflows-branching.test.ts` pins these
triggers and guards.

## CRITICAL: Never Push to develop or main Directly

Always create a feature branch and open a PR against `develop`. Never push to
`develop` or `main` directly; `main` is protected so that only the repo owner
can merge, and only from `develop` or `hotfix/*`.

## CRITICAL: Never Deploy Directly

Never run `wrangler deploy` / `npm run deploy` directly. Deployments go
through CI/CD:

1. Open a PR against `develop`, wait for CI, get approval, merge
2. CI deploys `develop` to staging automatically (`deploy-staging.yml`)
3. Production: the owner merges a release PR (`develop` → `main`), tags it,
   and dispatches `deploy-cloudflare.yml` on the tag

## Version Bumping

Every PR bumps the version in `package.json` (patch for fixes, docs and CI
tweaks; minor for features) with `npm version <patch|minor> --no-git-tag-version`,
committing `package.json` and `package-lock.json`. Feature PRs into `develop`
are not tagged. After a release PR (`develop` → `main`) merges, tag the
release on `main`:

```bash
git checkout main && git pull
git tag v<version>
git push --tags
```

The tag covers every PR since the previous release.

## Cross-Repo Rules

- **NEVER modify files in other repositories** (e.g., `../bt-servant-worker`)
  without explicit permission from the user. Reading/researching other repos is
  fine — writing requires approval.

## Sensitive Areas

Before modifying code in these areas, read the linked documentation first:

- **Streaming animation system** (`useAnimatedText`, `AnimatedText`,
  `handleComplete`, `finalizeComplete`) — Read [docs/streaming-animation.md](docs/streaming-animation.md).
  This code has had recurring bugs from well-intentioned refactors that
  unknowingly reverted critical fixes. The document explains the invariants
  that must be preserved.
