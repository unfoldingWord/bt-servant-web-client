# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL: Ask Before Pushing to Main

**ALWAYS ask the user before pushing changes.** This is non-negotiable.

Before committing and pushing, ask:

> "Should I push this directly to main, or create a feature branch and PR?"

**Default to creating a branch and PR** unless the user explicitly says to push to main.

## CRITICAL: Never Deploy Directly

**NEVER run `wrangler deploy` or `opennextjs-cloudflare` deploy directly.** This is non-negotiable.

All deployments MUST go through the CI/CD pipeline:

1. Commit changes to git
2. Push to a branch
3. Create a PR
4. Wait for CI to pass
5. Get approval and merge
6. CI will deploy automatically

## CRITICAL: Never Merge Without Permission

**NEVER merge a PR without explicit user approval.** This is non-negotiable.

**NEVER ask to merge or offer to merge a PR until the `claude-code-review` subagent has been run and all issues it reports are resolved.**

After pushing changes to a PR:

1. Wait for CI to pass
2. Run the `claude-code-review` subagent on the PR
3. Fix ALL issues reported by the review agent (Critical, High, Medium, and Low)
4. Push fixes and re-run the `claude-code-review` subagent
5. Repeat steps 3-4 until the review agent reports no remaining issues
6. Report the clean review results to the user
7. **ASK the user** if they want to merge
8. Only merge if the user explicitly says yes

## Git Commit Rules

1. **Commit Author**: Claude is the SOLE author. Do NOT include:
   - Co-Authored-By lines
   - Any reference to the user's name
   - Any "Generated with Claude Code" footer
   - Use `--author="Claude <claude@anthropic.com>"` on every commit
2. **Commit Messages**: ALWAYS include both a good subject AND description
3. **Pre-commit Must Pass**: NEVER commit if the pre-commit hook is failing. Loop until you fix all issues.
4. **No Suppression**: NEVER suppress warnings, disable linting rules, or skip checks without explicitly asking the user first
5. **No --no-verify**: NEVER use `--no-verify` or any flag to skip pre-commit hooks

## Things to Remember Before Writing Any Code

1. State how you will verify this change works (ex. tests, bash commands, browser checks, etc)
2. Write the test orchestration step first
3. Then implement the code
4. Run verification and iterate until it passes

## What to Do After a Push

After every `git push`, always do the following automatically:

1. **Monitor CI/CD** — watch `gh pr checks` (or `gh run list`) until all checks pass or fail. If a check fails, investigate and fix it.
2. **Create a PR if one doesn't exist** — if you're on a feature branch and no PR exists yet, create one after CI succeeds using `gh pr create`.
3. **Report results** — tell the user whether CI passed or failed, and share the PR URL if one was created.

## Responding to PR Review Comments

| Priority            | Action Required                                            |
| ------------------- | ---------------------------------------------------------- |
| **Critical**        | MUST fix before merge. No exceptions.                      |
| **High**            | MUST fix before merge.                                     |
| **Medium**          | MUST fix before merge. These are real issues.              |
| **Low**             | Either fix now OR add a TODO comment with issue reference.  |

## Sensitive Areas

Before modifying code in these areas, read the linked documentation first:

- **Streaming animation system** (`useAnimatedText`, `AnimatedText`,
  `handleComplete`, `finalizeComplete`) — Read [docs/streaming-animation.md](docs/streaming-animation.md).
  This code has had recurring bugs from well-intentioned refactors that
  unknowingly reverted critical fixes. The document explains the invariants
  that must be preserved.

## Development Commands

```bash
npm run dev           # Start Next.js dev server (localhost:3000)
npm run build         # Production build
npm run lint          # ESLint (zero warnings)
npm run lint:fix      # ESLint with auto-fix
npm run typecheck     # TypeScript check
npm run format        # Prettier format
npm run format:check  # Prettier check (CI)
```

## Pre-commit Hooks

Husky runs on every commit:

1. `lint-staged` — ESLint + Prettier on staged files
2. `npm run typecheck` — Full type check
3. `npm run build` — Ensure clean build

All must pass before a commit is accepted.
