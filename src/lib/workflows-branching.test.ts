import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Lives under src/lib so it runs in the node vitest project; it reads the
// workflow files from the repo root rather than importing app code.
const workflow = (name: string) =>
  readFileSync(resolve(process.cwd(), ".github/workflows", name), "utf8");

const ciYml = workflow("ci.yml");
const stagingYml = workflow("deploy-staging.yml");
const prodYml = workflow("deploy-cloudflare.yml");

const onBlock = (yml: string) =>
  yml.slice(yml.indexOf("\non:"), yml.indexOf("\njobs:"));

/**
 * Branching model (develop = integration, main = release):
 * - CI runs for both branches.
 * - Staging deploys only from develop, and never from a PR branch.
 * - Production deploys only from a v* release tag that is on main.
 */
describe("workflow triggers follow the develop/main branching model", () => {
  it("CI runs on push and pull_request for develop and main", () => {
    const on = onBlock(ciYml);
    expect(on).toMatch(/push:\s*\n\s*branches: \[main, develop\]/);
    expect(on).toMatch(/pull_request:\s*\n\s*branches: \[main, develop\]/);
  });

  it("CI refuses a PR into main unless it comes from develop or hotfix/*", () => {
    expect(ciYml).toContain("name: Release Source");
    expect(ciYml).toContain(
      "github.event_name == 'pull_request' && github.base_ref == 'main'"
    );
    expect(ciYml).toContain("develop|hotfix/*)");
  });

  it("staging deploys from develop only and has no pull_request trigger", () => {
    const on = onBlock(stagingYml);
    expect(on).not.toContain("pull_request");
    expect(on).toMatch(/workflow_run:[\s\S]*branches: \[develop\]/);
    expect(stagingYml).not.toContain("github.event_name == 'pull_request'");
  });

  it("staging deploys only after a successful push-triggered CI run, at the validated commit", () => {
    // A release PR (develop -> main) runs CI with head branch develop, which
    // the workflow_run branch filter also matches; without the push check,
    // every merge into develop would deploy staging twice.
    expect(stagingYml).toContain(
      "github.event.workflow_run.conclusion == 'success'"
    );
    expect(stagingYml).toContain("github.event.workflow_run.event == 'push'");
    expect(stagingYml).toContain(
      "ref: ${{ github.event.workflow_run.head_sha }}"
    );
  });

  it("production refuses anything but a v* tag on main, before secrets or deploy", () => {
    const guardAt = prodYml.indexOf("name: Require a release tag on main");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(
      prodYml.indexOf("name: Inject secrets into wrangler config")
    );
    expect(guardAt).toBeLessThan(
      prodYml.indexOf("run: npx opennextjs-cloudflare deploy")
    );
    expect(prodYml).toContain("refs/tags/v*)");
    expect(prodYml).toContain(
      'git merge-base --is-ancestor "$GITHUB_SHA" origin/main'
    );
    expect(prodYml).toMatch(/fetch-depth: 0/);
  });
});
