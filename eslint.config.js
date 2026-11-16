import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

const banned = [
  { object: "Math", property: "random", message: "Nondeterministic. Use the seeded PRNG in the codec." },
  { object: "Date", property: "now", message: "Time reads are only allowed in apps/strip/src/clock." },
  { object: "performance", property: "now", message: "Time reads are only allowed in apps/strip/src/clock." },
];

// Package boundaries (see .kiro/steering/structure.md).
// Deep imports into any package, and relative paths into packages/ or apps/, are never allowed.
const internals = {
  group: ["@strip/*/**", "**/packages/**", "**/apps/**"],
  message: "Import only the public barrel of a package, never its internals.",
};
const boundary = (allowed, message) => ({
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        internals,
        { group: ["@strip/*", ...allowed.map((n) => `!@strip/${n}`)], message },
      ],
    },
  ],
});

export default tseslint.config(
  { ignores: ["design/**", "**/dist/**", "**/node_modules/**", "**/coverage/**", "**/playwright-report/**", "**/test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,js,mjs}"],
    languageOptions: { globals: { ...globals.es2023 } },
  },
  {
    files: [".kiro/hooks/scripts/*.mjs", "*.config.{js,ts}", "apps/strip/*.config.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["packages/*/src/**/*.ts", "apps/strip/src/**/*.ts"],
    rules: { "no-restricted-properties": ["error", ...banned] },
  },
  {
    files: ["packages/codec/src/**/*.ts"],
    rules: boundary([], "codec depends on nothing in the workspace."),
  },
  {
    files: ["packages/symbols/src/**/*.ts"],
    rules: boundary(["codec"], "symbols may import only @strip/codec."),
  },
  {
    files: ["apps/strip/src/**/*.ts"],
    rules: boundary(["codec", "symbols"], "apps/strip may import only @strip/codec and @strip/symbols."),
  },
  {
    files: ["apps/strip/src/clock/**/*.ts"],
    rules: { "no-restricted-properties": "off" },
  },
);
