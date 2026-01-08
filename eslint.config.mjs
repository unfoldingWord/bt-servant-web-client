import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Onion Architecture Layers (outer → inner):
 *
 * app/        → Routes/Pages (can import from: components, hooks, lib, types)
 * components/ → UI Components (can import from: hooks, lib, types)
 * hooks/      → Business Logic (can import from: lib, types)
 * lib/        → Core Utilities (can import from: types only)
 * types/      → Domain Types (no internal dependencies)
 *
 * Rule: Never import "upward" in the hierarchy
 *
 * Enforced via no-restricted-imports patterns below.
 */

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // ===========================================
  // ONION ARCHITECTURE: Types layer restrictions
  // Types should have no internal dependencies
  // ===========================================
  {
    files: ["**/types/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/*", "@/lib/**"],
              message: "Types cannot import from lib (onion architecture)",
            },
            {
              group: ["@/hooks/*", "@/hooks/**"],
              message: "Types cannot import from hooks (onion architecture)",
            },
            {
              group: ["@/components/*", "@/components/**"],
              message:
                "Types cannot import from components (onion architecture)",
            },
            {
              group: ["@/app/*", "@/app/**"],
              message: "Types cannot import from app (onion architecture)",
            },
          ],
        },
      ],
    },
  },

  // ===========================================
  // ONION ARCHITECTURE: Lib layer restrictions
  // Lib can only import from types, not from upper layers
  // ===========================================
  {
    files: ["**/lib/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/hooks/*", "@/hooks/**"],
              message: "Lib cannot import from hooks (onion architecture)",
            },
            {
              group: ["@/components/*", "@/components/**"],
              message: "Lib cannot import from components (onion architecture)",
            },
            {
              group: ["@/app/*", "@/app/**"],
              message: "Lib cannot import from app (onion architecture)",
            },
          ],
        },
      ],
    },
  },

  // ===========================================
  // ONION ARCHITECTURE: Hooks layer restrictions
  // Hooks can import from lib/types, not from components/app
  // ===========================================
  {
    files: ["**/hooks/**/*.ts", "**/hooks/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/*", "@/components/**"],
              message:
                "Hooks cannot import from components (onion architecture)",
            },
            {
              group: ["@/app/*", "@/app/**"],
              message: "Hooks cannot import from app (onion architecture)",
            },
          ],
        },
      ],
    },
  },

  // ===========================================
  // ONION ARCHITECTURE: Components layer restrictions
  // Components can import from hooks/lib/types, not from app
  // ===========================================
  {
    files: ["**/components/**/*.ts", "**/components/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@/app/**"],
              message: "Components cannot import from app (onion architecture)",
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
