import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

/**
 * No product names in code or UI. `no-restricted-syntax` settings replace each
 * other rather than merge, so every block that sets it repeats this entry.
 * The character class keeps this file from matching its own selector.
 */
const NO_PRODUCT_NAMES = {
  selector: "Literal[value=/y[n]ab/i], TemplateElement[value.raw=/y[n]ab/i]",
  message: "No product names in code or UI: describe the accepted format instead.",
};

/**
 * Rules aim at mistakes that pass the compiler and look fine in review,
 * because most of this code is written by LLMs and read by one reviewer.
 * Formatting is left to Prettier. `npm run lint` fails on warnings too, so
 * every rule here is effectively an error: a warning nobody acts on is noise.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Type-aware rules: unawaited promises, `switch`es that miss a case when a
  // union grows, conditions that are always true, `any` leaking through.
  {
    files: ["**/*.{ts,tsx,mts}"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": ["error", { considerDefaultExhaustiveForUnions: true }],
      // Numbers in messages (line numbers, counts) are the common, safe case.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },

  // General rules, from a familiar shared config minus its formatting rules.
  {
    rules: {
      complexity: ["error", 10],
      "max-depth": ["error", 3],
      "max-params": ["error", 5],
      curly: ["error", "all"],
      eqeqeq: "error",
      "no-negated-condition": "error",
      "no-self-compare": "error",
      "no-eval": "error",
      "no-bitwise": "error",
      "no-lone-blocks": "error",
      "no-loop-func": "error",
      "no-useless-concat": "error",
      "no-var": "error",
      "prefer-const": "error",
      "prefer-template": "error",
      "object-shorthand": ["error", "properties"],
      radix: "error",
      // Finished code carries no TODOs; open work lives in the tracker.
      "no-warning-comments": "error",
      // Transactions must never reach a log. The telemetry sink is the one
      // place allowed to call `console`, with a disable comment saying why.
      "no-console": "error",
      "react/no-danger": "error",
      "import/no-extraneous-dependencies": [
        "error",
        { devDependencies: ["tests/**", "e2e/**", "*.config.{ts,mts,mjs}"], optionalDependencies: false },
      ],
      // The project's own conventions, enforced rather than only written down.
      "no-restricted-syntax": ["error", NO_PRODUCT_NAMES],
    },
  },

  // Privacy: nothing in the app may persist data in the browser.
  {
    files: ["src/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["localStorage", "sessionStorage", "indexedDB"].map((name) => ({
          name,
          message: "Transactions and results are never stored in the browser.",
        })),
      ],
      "no-restricted-properties": [
        "error",
        ...["localStorage", "sessionStorage", "indexedDB"].map((property) => ({
          object: "window",
          property,
          message: "Transactions and results are never stored in the browser.",
        })),
      ],
    },
  },

  // The core stays pure: no React, Next or UI code, so it runs and is tested in plain Node.
  {
    files: ["src/lib/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "react-dom/*", "next", "next/*", "@/components/*", "@/app/*"],
              message: "src/lib is the pure core: no React, Next or UI imports.",
            },
          ],
        },
      ],
    },
  },

  // Money maths: integer cents, divided only with divRound. A float quotient
  // or rounding helper silently loses or invents cents.
  {
    files: ["src/lib/{money,budget,plan}/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        NO_PRODUCT_NAMES,
        {
          selector: "BinaryExpression[operator='/'], AssignmentExpression[operator='/=']",
          message:
            "Divide cents only with divRound (money/cents.ts). Mark an exact or non-money division with a disable comment saying why.",
        },
        {
          selector: "CallExpression[callee.property.name=/^(round|toFixed|toPrecision)$/]",
          message: "Round cents only through divRound (money/cents.ts).",
        },
        {
          selector: "CallExpression[callee.name='parseFloat'], CallExpression[callee.property.name='parseFloat']",
          message: "Parse amounts with parseAmount (money/cents.ts), which keeps exact cents.",
        },
      ],
    },
  },

  // Next requires these config functions to be async, even with nothing to await.
  {
    files: ["next.config.ts"],
    rules: { "@typescript-eslint/require-await": "off" },
  },

  // Config files aren't in a TypeScript project, so they get no type-aware rules.
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated test output:
    "reports/**",
    ".stryker-tmp/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
