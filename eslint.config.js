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

// apps/strip import rules: public barrels only, plus the one documented subpath of @strip/symbols (R12.3).
const appImports = (banGallery) => ({
  // The style prop is allowed only in components/Ring.tsx (CSSOM stroke-dasharray, R19.13, R15.9).
  "no-restricted-syntax": ["error", { selector: "JSXAttribute[name.name='style']", message: "No style prop outside components/Ring.tsx (CSP: styling comes from strip.css)." }],
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        { ...internals, group: ["@strip/*/**", "!@strip/symbols/wasm-url", "**/packages/**", "**/apps/**"] },
        { group: ["@strip/*", "!@strip/codec", "!@strip/symbols"], message: "apps/strip may import only @strip/codec and @strip/symbols." },
        ...(banGallery ? [{ group: ["**/gallery/**", "**/gallery"], message: "The gallery is harness-only: only App.tsx may import it, dynamically." }] : []),
      ],
    },
  ],
});

// symbolsImports: option overrides replace the default restriction for one file group.
// A false value lifts that restriction for the group.
const symbolsImports = (override) => {
  const regexes = {
    qr: "^qr(/|$)",
    zxing: "^zxing-wasm(/|$)",
    url: "\\?url$",
    wasmUrl: "(^|/)wasm-url(\\.[cm]?[jt]s)?$",
    ...override,
  };
  return {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          internals,
          { group: ["@strip/*", "!@strip/codec"], message: "symbols may import only @strip/codec." },
          ...(regexes.qr ? [{ regex: regexes.qr, message: "qr is imported only by qr-encoder.ts, and never its decoder (R11.4, R11.5)." }] : []),
          ...(regexes.zxing ? [{ regex: regexes.zxing, message: "zxing-wasm/reader is imported only by zxing-backend.ts (R11.4)." }] : []),
          ...(regexes.url ? [{ regex: regexes.url, message: "Asset-URL imports are only allowed in wasm-url.ts (R10.4)." }] : []),
          { regex: regexes.wasmUrl, message: "No src file imports wasm-url.ts (R10.4)." },
        ],
      },
    ],
    "@typescript-eslint/no-restricted-imports": [
      "error",
      { patterns: [{ group: ["@strip/codec"], allowTypeImports: true, message: "Import only types from @strip/codec (R1.11)." }] },
    ],
  };
};
export default tseslint.config(
  { ignores: ["design/**", "**/dist/**", "**/node_modules/**", "**/coverage/**", "**/playwright-report/**", "**/test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,js,mjs}"],
    languageOptions: { globals: { ...globals.es2023 } },
  },
  {
    files: [".kiro/hooks/scripts/*.mjs", "*.config.{js,ts}", "apps/strip/*.config.ts", "apps/strip/e2e-harness/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["packages/*/src/**/*.ts", "apps/strip/src/**/*.{ts,tsx}"],
    rules: { "no-restricted-properties": ["error", ...banned] },
  },
  {
    files: ["packages/codec/src/**/*.ts"],
    rules: boundary([], "codec depends on nothing in the workspace."),
  },
  // symbols: workspace boundary plus the third-party import rules of the symbols design (R10.4, R11.4, R11.5).
  // Later blocks replace the whole rule options, so each block lists its own full pattern set.
  {
    files: ["packages/symbols/src/**/*.ts"],
    rules: symbolsImports({}),
  },
  {
    files: ["packages/symbols/src/qr-encoder.ts"],
    rules: symbolsImports({ qr: "^qr/" }),
  },
  {
    files: ["packages/symbols/src/zxing-backend.ts"],
    rules: symbolsImports({ zxing: "^zxing-wasm(?!/reader$)(/|$)" }),
  },
  {
    files: ["packages/symbols/src/wasm-url.ts"],
    rules: symbolsImports({
      zxing: "^zxing-wasm(?!/reader/zxing_reader\\.wasm\\?url$)(/|$)",
      url: false,
    }),
  },
  {
    files: ["apps/strip/src/**/*.{ts,tsx}"],
    rules: appImports(true),
  },
  // The gallery is harness-only: nothing imports it except the one dynamic import in App.tsx (design: Gallery exclusion).
  {
    files: ["apps/strip/src/gallery/**/*.{ts,tsx}", "apps/strip/src/app/App.tsx"],
    rules: appImports(false),
  },
  {
    files: ["apps/strip/src/components/Ring.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: ["apps/strip/src/clock/**/*.{ts,tsx}"],
    rules: { "no-restricted-properties": "off" },
  },
);
