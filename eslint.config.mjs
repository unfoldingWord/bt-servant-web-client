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

  // ===========================================
  // I18N: the dictionary layer is a leaf
  // src/i18n/** may import only from itself and from types
  // ===========================================
  {
    files: ["**/i18n/**/*.ts", "**/i18n/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/*", "@/lib/**"],
              message: "i18n cannot import from lib (leaf layer)",
            },
            {
              group: ["@/hooks/*", "@/hooks/**"],
              message: "i18n cannot import from hooks (leaf layer)",
            },
            {
              group: ["@/components/*", "@/components/**"],
              message: "i18n cannot import from components (leaf layer)",
            },
            {
              group: ["@/app/*", "@/app/**"],
              message: "i18n cannot import from app (leaf layer)",
            },
          ],
        },
      ],
    },
  },

  // ===========================================
  // I18N: no hardcoded user-facing strings in JSX (see docs/i18n.md)
  //
  // Every user-visible string must come from src/i18n via useT()/t().
  // `react/jsx-no-literals` catches JSX text children and `{"literal"}`
  // expression containers. It is run with `ignoreProps: true` because with
  // `ignoreProps: false` the rule reports every string attribute
  // (className, type, svg `d`, ...) with no per-attribute filter — 196 hits
  // on this tree. The user-facing attributes and the ternary/logical
  // literals the rule does not see are covered by the `no-restricted-syntax`
  // selectors below instead. Both only see JSX: strings a hook or lib
  // module returns for display are convention-only (docs/i18n.md).
  // ===========================================
  {
    files: [
      "src/components/**/*.tsx",
      "src/app/**/*.tsx",
      "src/hooks/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: true,
          ignoreProps: true,
          allowedStrings: [
            // Punctuation / glyphs rendered as JSX text
            "·",
            // Product names are not translation targets
            "BT Servant",
            "BTS Web",
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          // aria-label="text"
          selector:
            "JSXAttribute[name.name=/^(aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext|placeholder|title|alt|tooltip|label)$/] > Literal",
          message:
            "User-facing attribute strings must come from the i18n dictionary (useT()/t()). See docs/i18n.md.",
        },
        {
          // aria-label={"text"} and aria-label={`text`}
          selector:
            "JSXAttribute[name.name=/^(aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext|placeholder|title|alt|tooltip|label)$/] > JSXExpressionContainer > :matches(Literal, TemplateLiteral)",
          message:
            "User-facing attribute strings must come from the i18n dictionary (useT()/t()). See docs/i18n.md.",
        },
        {
          selector:
            "JSXExpressionContainer > ConditionalExpression > Literal[value=/[A-Za-z]{2,}/]",
          message:
            "Hardcoded string in a JSX conditional; use the i18n dictionary (useT()/t()). See docs/i18n.md.",
        },
        {
          selector:
            "JSXExpressionContainer > LogicalExpression > Literal[value=/[A-Za-z]{2,}/]",
          message:
            "Hardcoded string in a JSX logical expression; use the i18n dictionary (useT()/t()). See docs/i18n.md.",
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
    // Cloudflare-generated environment types (regenerated via cf-typegen):
    "cloudflare-env.d.ts",
    // Cloudflare build output:
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
