# Dependencies

Every dependency is exact-pinned and needs a row here, plus explicit approval, before it is added. A new package gets its row in the same commit that adds it.

This table lists direct dependencies (runtime and dev) declared in any `package.json`. Transitive dependencies are locked in `pnpm-lock.yaml`.

| name | exact version | license | reason |
| ---- | ------------- | ------- | ------ |
| zod | 4.6.7 | MIT | Runtime input validation at public API boundaries. Approved for `apps/strip` only; `packages/codec` has no runtime dependencies. |
| @eslint/js | 10.0.1 | MIT | ESLint recommended rule set (dev). |
| @playwright/test | 1.65.1 | Apache-2.0 | Browser end-to-end tests in bundled Chromium against a localhost harness (dev). |
| eslint | 10.15.0 | MIT | Linting, purity bans and package-boundary rules (dev). |
| fast-check | 4.10.2 | MIT | Property-based tests for correctness properties (dev). |
| globals | 17.14.0 | MIT | Environment globals for ESLint flat config (dev). |
| typescript | 6.0.3 | Apache-2.0 | TypeScript compiler, strict typecheck. Pinned to 6.0.x because typescript-eslint does not support TS 7 (dev). |
| typescript-eslint | 8.72.2 | MIT | TypeScript parser and rules for ESLint (dev). |
| vite | 8.3.8 | MIT | Dev server and bundler for the PWA (dev). |
| vitest | 5.1.0 | MIT | Unit and property test runner (dev). |
