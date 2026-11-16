# Tech

## Stack

- pnpm 10 monorepo, TypeScript strict, Vite, Vitest, fast-check, Playwright (bundled Chromium, localhost harness only), Zod, ESLint flat config.
- Only esbuild is approved to run build scripts (`onlyBuiltDependencies` in pnpm-workspace.yaml).

## Purity rules for packages/codec and packages/symbols

- Pure and deterministic. No DOM.
- No `Math.random`, `Date.now`, or `performance.now`.
- All randomness comes from a seeded PRNG inside the codec.
- ESLint enforces the bans in `packages/*/src` and `apps/strip/src`. The only exception is `apps/strip/src/clock`, the sole place allowed to read time.

## Dependencies

- Exact-pinned versions only (no `^` or `~`).
- Each dependency needs a row in `docs/dependencies.md` (name, exact version, license, reason).
- Get the user's approval before adding any dependency. packages/codec has zero runtime dependencies.

## Working rules

- On any property-test counterexample, ambiguity, or dependency decision: stop and report. Never work around it.
