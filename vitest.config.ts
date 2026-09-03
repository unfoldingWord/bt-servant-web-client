import { configDefaults, defineConfig } from "vitest/config";

// Environment follows directory, not file extension: BFF route handlers and
// lib units run under node; everything else under src/ (hooks, components,
// app pages) is UI and runs under jsdom with Testing Library.
const NODE_TESTS = ["src/app/api/**/*.test.ts", "src/lib/**/*.test.ts"];

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    restoreMocks: true,
    unstubGlobals: true,
    // teardownMounted (src/test/timers.ts) relies on file-level afterEach running
    // before the setup file's cleanup(); pin the order instead of trusting the default.
    sequence: { hooks: "stack" },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: NODE_TESTS,
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, ...NODE_TESTS],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
