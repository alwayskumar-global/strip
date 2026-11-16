# Structure

- `packages/codec` (`@strip/codec`): depends on nothing.
- `packages/symbols` (`@strip/symbols`): QR encode/decode wrappers. Depends on codec types only.
- `apps/strip` (`@strip/app`): the PWA, sender and receiver. Depends on codec and symbols.
- `apps/strip/src/clock`: the only place allowed to read time.
- `docs/dependencies.md`: dependency log.

## Boundaries

- Apps never import package internals. They import only the public barrel (`src/index.ts`, exposed via package `exports`).
- Dependency direction: codec <- symbols <- app. No cycles.
