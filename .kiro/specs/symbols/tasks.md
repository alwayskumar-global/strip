# Implementation Plan: Symbols (`@strip/symbols`)

## Overview

Four groups, built bottom-up: (1) encoder, Latin-1 mapping, capacity table, canvas and SVG renderers, fitScale and package tooling; (2) wasm loading, frame decoder, decode worker, and the Playwright proof that the wasm loads and decodes under the exact Strip_CSP with a request log; (3) degrader, fixtures, barrel exactness, codec integration and the remaining Playwright tests; (4) measured gates, perf scripts, third-party notices, README, device-check template, final dependency verification and traceability. Source goes in `packages/symbols/src`. Tests go in `packages/symbols/test`. Perf and measured scripts go in `packages/symbols/perf`. App-side files go in `apps/strip`. Property ids (P1..P26) and requirement ids (R1.1..R15.5) are the ones in design.md "Correctness properties" and requirements.md.

Tag legend, as in design.md "Test configs":

| Tag | Meaning | Command |
|---|---|---|
| [unit] | example or table test | `pnpm test` |
| [property] | fast-check property, at least 100 runs, fixed seed (P1 and P18 use the reduced counts in design.md) | `pnpm test` |
| [measured] | seeded statistical or batch run with N, rate and Wilson bound printed | `pnpm test:measured` (package script, `vitest.measured.config.ts`) |
| [perf] | Perf_Method script (median of 20 runs after 3 warm-ups, `process.hrtime.bigint`) | `pnpm perf` (package script, `vitest.perf.config.ts`) |
| [Playwright] | Chromium harness test | `pnpm test:e2e` |
| [manual] | recorded human check | none |

## Global rules

1. **Stop-and-wait.** On any property counterexample, ambiguity, dependency decision, a test failing twice, or a failed requirement, stop and report. Never work around it.
2. **Credit cap.** 60 credits per group. If a group is projected to exceed it, stop and report before continuing.
3. **Dependencies.** `qr` 0.7.2 and `zxing-wasm` 3.1.7 are APPROVED and exact-pinned (no `^` or `~`). Each is added in the task named below (`qr` in 1.5, `zxing-wasm` in 2.1) TOGETHER with its `docs/dependencies.md` row (name, exact version, license, reason) in the same commit, enforced by `tools/deps.test.ts`. Any other dependency needs new approval. No Python tooling. No `@types/node`: use ambient shims like the codec's `test/node-shim.d.ts` and `perf/node-shim.d.ts`, declaring only the subset used. `apps/strip` gets NO `qr` or `zxing-wasm` dependency (R11.8). Contingency, only if the build-and-load test in 2.6 fails: a direct `apps/strip` dependency on `zxing-wasm` with the identical pin and its own `docs/dependencies.md` row, amending R11.8 and R9.10, and the task notes record which path was taken. That contingency needs the user's confirmation first.
4. **Commits.** One commit per sub-task, with conventional messages (`feat(symbols): ...`, `test(symbols): ...`, `feat(app): ...`, `build(symbols): ...`, `docs(symbols): ...`). The task checkbox is ticked in the SAME commit, and the commit message names the task id (for example `feat(symbols): add capacity table (task 1.3)`).
5. **Purity.** No `Math.random`, `Date.now`, `performance.now`, `fetch` or DOM access in `packages/symbols/src`. Tests, perf and e2e live outside `src`. The clock exception stays `apps/strip/src/clock` only.
6. **Per-group verification.** After each group run `pnpm lint`, `pnpm typecheck` and `pnpm test` (and, for groups touching the app, `pnpm test:e2e`), and report the outputs.
7. **Gating.** Do not start the next group until the previous group's checkpoint passes. Group 3 must not start until the user approves at the Group 2 checkpoint (task 2.8).
8. **Property tag convention.** Every property test carries the comment `Feature: symbols, Property N: <text>` and is one test. fast-check runs at least 100 iterations with fixed seeds, and the seed is reported on failure. Properties that decode inside the loop (P1, P18) use the reduced run counts stated in design.md.
9. **Degrader fidelity.** If the TypeScript degrader's rates differ from the spike's beyond the Wilson interval, stop and report instead of retuning.
10. **Tag legend.** Test bullets use the tags in the legend above. The command that runs each tag is the one in the legend.
11. **Default_Cell.** v30 / ECC L / 1732 bytes / 4 ppm stays as `QR_DEFAULTS` and stays overridable (R1.12). Changing it needs the user.
12. **Wasm cost report.** The Group 2 checkpoint reports the measured wasm init time and the built `.wasm` size under the real CSP.

## Tasks

- [ ] 1. Group 1: Encoder, Latin-1 mapping, capacity table, renderers, fitScale, tooling
  - [ ] 1.1 Package tooling and static import checks
    - `packages/symbols/tsconfig.json` for `src` with `lib: ["ES2023"]`, no DOM, no Node types. `tsconfig.test.json` for `test`, `perf` and `e2e`-free test code, including the ambient shims `test/node-shim.d.ts` and `perf/node-shim.d.ts`. The `typecheck` script covers both.
    - `vitest.config.ts` (default, `test/**/*.test.ts`), `vitest.measured.config.ts` (`perf/measured/*.measured.ts`) and `vitest.perf.config.ts` (`perf/*.perf.ts`). Scripts `test`, `test:measured`, `perf`, `typecheck` in `package.json`.
    - `src/vite-url.d.ts` declaring `module "*?url"`.
    - `package.json` `exports` with exactly `.` (`./src/index.ts`) and `./wasm-url` (`./src/wasm-url.ts`). In this task `src/wasm-url.ts` is a placeholder with NO `?url` import and a header comment `STUB until task 2.4`, exporting `readerWasmUrl` as an empty string. The real file lands in 2.4.
    - ESLint overrides (`no-restricted-imports`): `qr` only in `qr-encoder.ts`; `zxing-wasm/reader` only in `zxing-backend.ts`, and never `zxing-wasm`, `zxing-wasm/full` or `zxing-wasm/writer`; the pattern `*?url` in every `src` file except `wasm-url.ts`; no `src` file imports `wasm-url.ts`; `@strip/codec` only through `import type` (`consistent-type-imports`).
    - Test: static grep of `src` for each import rule, including that `qr`'s decoder entry is never imported and that only `wasm-url.ts` contains `?url` (R10.4, R11.4, R11.5) [unit].
    - Test: every `@strip/codec` import in `src` is type-only (R1.11) [unit].
    - Test: `src` compiles with zero errors without DOM (R10.4) [unit].
    - Test: `package.json` `exports` has exactly the entries `.` and `./wasm-url` (R12.3) [unit].
    - Test: `apps/strip/package.json` has no `qr` or `zxing-wasm` entry (R11.8) [unit].
    - Test: the purity scan of `packages/symbols/src` reports zero uses of `Math.random`, `Date.now`, `performance.now`, `fetch`, `document` and `window` (R10.1) [unit].
    - _Requirements: 1.11, 10.1, 10.4, 11.4, 11.5, 11.8, 12.3_

  - [ ] 1.2 `errors.ts` and `validate.ts`
    - `SYMBOL_ERROR_CODES` as the closed tuple INVALID_INPUT, PACKET_TOO_LARGE, ENCODE_FAILED, UNSUPPORTED_ENVIRONMENT; `SymbolErrorCode`; `SymbolError extends Error` with `readonly code` and a non-empty message.
    - Hand-written validators that throw INVALID_INPUT, with no Zod: `assertBytes`, `assertImageDataLike` (integer positive width and height, `Uint8ClampedArray` data, length equal to width x height x 4), `assertEncodeOptions` (ecc in L, M, Q, H; version an integer in 1..40; shape only), `assertRenderOptions` (integer `ppm` >= 1, quiet zone, colour strings, `mm`; a quiet zone below 4 without `allowShortQuietZone` throws), `assertDecodeOptions`. Capacity-dependent checks stay in `encode-symbol.ts` (task 1.5), so `validate.ts` imports only `errors`.
    - Test: exactly four codes, `instanceof SymbolError` and `Error`, non-empty message, `code` in `SYMBOL_ERROR_CODES` (R8.1) [unit].
    - Test: each validator on boundaries and wrong types (null, strings, floats, NaN, zero, negatives, wrong array type, wrong data length) (R8.3, R5.5) [unit].
    - Test: quiet zone 3 without `allowShortQuietZone` throws INVALID_INPUT, with it passes (R2.3) [unit].
    - _Requirements: 2.3, 5.5, 8.1, 8.3_

  - [ ] 1.3 `capacity.ts`, ISO fixture and table equality (P26)
    - `QR_CAPACITY` (2953, 2331, 1663, 1273), `QR_CAPACITY_BY_VERSION` (40 versions x L, M, Q, H, defined in this package without runtime imports from `@strip/codec`), `QR_DEFAULTS` (screen and print, each v30, L, 1732, minimum 4 ppm), `smallestVersion(len, ecc)`.
    - `test/fixtures/iso-capacity.ts`: the ISO_Capacity_Table typed from ISO/IEC 18004 (byte mode, all 160 cells), data only, no import from `src`. The file header cites the source (the standard clause and table, and any secondary reference used). Cross-check the typed values against the widely published byte-mode capacity table. On any doubtful cell, STOP and report; do not pick a value.
    - Test (P26): `QR_CAPACITY_BY_VERSION` equals the ISO table in all 160 cells; `QR_CAPACITY` equals its version 40 row; the version 30 row is 1732, 1370, 982, 742 (R1.4, R14.1) [unit].
    - Test: the codec default packet size is 2953 and equals `QR_CAPACITY.L`; `QR_DEFAULTS.screen.packetSize` and `.print.packetSize` equal the version 30 L capacity (1732) (R1.10, R14.1) [unit].
    - Test: for each ecc, each codec `packetSize` in 46..65565 that is at most the capacity of that ecc is accepted by the codec `encode` option check (runtime import of `@strip/codec` is allowed in tests only) (R1.10, R14.3) [unit].
    - Test: `QR_DEFAULTS` has screen and print entries with v30, L, 1732, 4; `version` 1..40 and ecc L, M, Q, H remain selectable through the table (R14.2) [unit].
    - Test: `smallestVersion` at examples (1 byte gives v1, 2953 at L gives v40, 1732 at L gives v30) and above capacity (R1.2) [unit].
    - Property P26: **Feature: symbols, Property 26: QR_CAPACITY_BY_VERSION equals the ISO_Capacity_Table in all 160 cells, QR_CAPACITY equals its version 40 row, the codec default stays 2953, and each codec packetSize up to capacity is accepted** [unit].
    - _Requirements: 1.2, 1.4, 1.10, 1.14, 14.1, 14.2, 14.3_

  - [ ] 1.4 `bytes.ts` and P20
    - `bytesToLatin1` (chunked, 8192) and `latin1TextEncoder` as in the design.
    - Test: all 256 byte values map to the same char codes and back [unit].
    - Test: empty input, input longer than the chunk size (for example 20000 bytes) [unit].
    - Property P20: **Feature: symbols, Property 20: for any bytes, bytesToLatin1 then latin1TextEncoder.encode returns the input and each char code equals the byte** [property].
    - _Requirements: 1.13_

  - [ ] 1.5 Add `qr` 0.7.2, `matrix.ts`, `encoder.ts`, `qr-encoder.ts`, `encode-symbol.ts`
    - Add `qr` 0.7.2 to `packages/symbols/package.json` (exact pin, no range) and its row to `docs/dependencies.md` (name, exact version, license, reason) in the same commit. Re-check the option names (`ecc`, `encoding`, `textEncoder`, `version`, `mask`, `border`, `scale`, `optimize`) against the installed `.d.ts`. On any mismatch with the design, STOP and report.
    - `matrix.ts`: `SymbolMatrix` type, `matrixFromRows` (checks `size === 17 + 4 * version`), `moduleAt`. `encoder.ts`: internal `Encoder` interface. `qr-encoder.ts`: `createQrEncoder()`, the only file importing `qr`, passing `ecc`, explicit `version`, `encoding: "byte"`, `textEncoder: latin1TextEncoder`, `border: 0`; the mask is read back from the format information; any `qr` throw maps to ENCODE_FAILED. `encode-symbol.ts`: validate, capacity check against `QR_CAPACITY` or the version's table value (PACKET_TOO_LARGE), `smallestVersion`, delegate.
    - Test: 1 byte and 1732 bytes encode in byte mode, one segment, no ECI; the matrix has `modules.length == size * size` (R1.1, R2.1) [unit].
    - Test: default ecc is L; L, M, Q, H are each accepted (R1.3) [unit].
    - Test: length exactly `QR_CAPACITY[ecc]` returns version 40 for each ecc; length + 1 throws PACKET_TOO_LARGE (R1.5, R1.6) [unit].
    - Test: an explicit version is honoured, and a packet that does not fit that version throws PACKET_TOO_LARGE (R1.12) [unit].
    - Test: all 160 cells: a payload of exactly the ISO table capacity encodes at that explicit version, and capacity + 1 throws PACKET_TOO_LARGE (R1.14) [unit].
    - Test (adapter level): call `createQrEncoder().encode` directly with capacity + 1 bytes, bypassing our check, and assert the failure surfaces as a SymbolError with code ENCODE_FAILED (R8.4, R1.14) [unit].
    - Test: `encodeSymbol` with a non-Uint8Array throws INVALID_INPUT before any encoding (R8.3) [unit].
    - Test: identical bytes and options give deep-equal matrices across two calls (R1.9) [unit].
    - Test: bytes 0x80..0xFF are not expanded: a payload of 300 high bytes encodes at the version computed from 300, not from a UTF-8 length (R1.13) [unit].
    - Test: the encoder sits behind the internal `Encoder` interface: `encodeSymbol` works with an injected fake `Encoder` (R11.6) [unit].
    - Test: `package.json` lists `qr` as exactly `0.7.2` with no range, and `tools/deps.test.ts` passes (R11.1, R11.2, R11.3) [unit].
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.9, 1.12, 1.13, 1.14, 2.1, 8.3, 8.4, 11.1, 11.2, 11.3, 11.6_

  - [ ] 1.6 Property tests P2, P3, P4, P5
    - `test/helpers/matrix-structure.ts`: independent structural helper that checks finder patterns, separators, timing row and column 6, the dark module, format information (BCH check, both copies) and, for version >= 7, version information (BCH check, both copies). It is written from the QR specification and does not import from `src` beyond the matrix type.
    - Property P2: **Feature: symbols, Property 2: for any bytes and options, two encodeSymbol calls return deep-equal matrices with the same mask** (R1.9, R10.2) [property].
    - Property P3: **Feature: symbols, Property 3: for any encoded matrix, size and length match 17 + 4 * version and finder, separators, timing, dark module, format and version information match the spec** (R2.1, R2.4, R14.4) [property]. Also assert the width including a 4-module Quiet_Zone equals 17 + 4 x version + 8 for every version 1..40 (580 px at v30 and 740 px at v40 at 4 ppm) [unit].
    - Property P4: **Feature: symbols, Property 4: for any ecc and version, a payload of the ISO capacity encodes at exactly that version and one byte more throws PACKET_TOO_LARGE; with no version, QR_CAPACITY bytes gives version 40 and one more throws** (R1.5, R1.6, R1.12, R1.14) [property]. The exhaustive 160-cell unit test is in 1.5.
    - Property P5: **Feature: symbols, Property 5: for any length and ecc with no version option, the matrix version equals the smallest version whose table capacity is at least the length** (R1.2) [property].
    - If any property reports a counterexample, STOP and report.
    - _Requirements: 1.2, 1.5, 1.6, 1.9, 1.12, 1.14, 2.1, 2.4, 10.2, 14.4_

  - [ ] 1.7 `fit-scale.ts` and P7
    - `fitScale(matrix, quietZone, box)` returning the largest integer ppm and the pixel size, or `{ ppm: 0, width: 0, height: 0 }` without throwing when the box is too small.
    - Test (R14.5 examples): quiet zone 4, box 504 (720p at 70%): v25 gives scale >= 4, v26 gives scale below 4 (3); box 756 (1080p): v40 gives scale >= 4 (R14.5) [unit].
    - Test: box smaller than the module count returns `{0, 0, 0}` and does not throw (R3.6) [unit].
    - Property P7: **Feature: symbols, Property 7: for any matrix, quiet zone and box, fitScale returns the largest integer ppm with modules * ppm at most min(box), width and height equal modules * ppm, and returns {0,0,0} without throwing when the box is smaller than modules** (R3.5, R3.6, R14.5) [property].
    - _Requirements: 3.5, 3.6, 14.5_

  - [ ] 1.8 `render-canvas.ts` and P22
    - `Canvas2DLike` structural type and `renderToCanvas(ctx, matrix, options)`: smoothing off, light fill, integer-coordinate `fillRect` per dark module or per merged horizontal run, `canvas.width` and `canvas.height` set when present, default black on white, configurable colours. Missing `fillRect` or `imageSmoothingEnabled` throws UNSUPPORTED_ENVIRONMENT. Test helper: a recording fake context.
    - Test: pixel width and height equal `(size + 2 * quietZone) * ppm`, the Quiet_Zone is the default 4 modules (R2.2, R3.1) [unit].
    - Test: every recorded `fillRect` has integer coordinates and sizes, and smoothing is false before the first draw (R3.1) [unit].
    - Test: the union of recorded dark rects equals the matrix dark modules (R3.1) [unit].
    - Test: default colours are black and white, and configured colours are used (R3.4) [unit].
    - Test: the context type needs no DOM lib: a plain object literal satisfies `Canvas2DLike` in a test compiled without DOM (R3.2) [unit].
    - Test: a context without `fillRect` throws UNSUPPORTED_ENVIRONMENT (R8.5) [unit].
    - Property P22: **Feature: symbols, Property 22: for any ppm, a quiet zone below 4 without allowShortQuietZone throws INVALID_INPUT, and with it renders** (R2.3) [property].
    - _Requirements: 2.2, 2.3, 3.1, 3.2, 3.4, 8.5_

  - [ ] 1.9 `render-svg.ts` and P8 (Node part)
    - `renderToSvg(matrix, options)` in the one-line shape of the design: viewBox in module units including the Quiet_Zone, `shape-rendering="crispEdges"`, a light background rect, one path of merged horizontal runs, `width` and `height` in mm only when `mm` is given, colours in `fill` presentation attributes only, colour strings validated against `^#[0-9a-fA-F]{3,8}$` or a short keyword list.
    - Test: viewBox is `0 0 W W` with `W = size + 2 * quietZone` (R4.1) [unit].
    - Test: `shape-rendering="crispEdges"` present; dark modules are a single path (R4.2) [unit].
    - Test: `mm` given sets `width="{mm}mm"` and `height="{mm}mm"`; without `mm` neither attribute appears (R4.3) [unit].
    - Test: colours appear only as `fill` attributes; a colour string with a quote or angle bracket throws INVALID_INPUT (R4.4) [unit].
    - Test: the path, parsed back to runs, covers exactly the dark modules (R4.1, R4.2) [unit].
    - Property P8: **Feature: symbols, Property 8: for any matrix and options, the SVG string has no `<script`, `<style`, `style=`, `on\w+=`, `href`, `url(` or `data:`, has crispEdges and a module-unit viewBox, and has mm width and height iff mm is given** (R4.1 to R4.5) [property]. The Chromium rasterisation half of P8 is in task 3.5 as a Playwright test.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 1.10 `test/helpers/matrix-to-image.ts`
    - `matrixToImageData(matrix, ppm, quietZone): { width, height, data: Uint8ClampedArray }`, black on white, RGBA, alpha 255, the same pixels the canvas path draws. It lives in `test/helpers` and is NOT exported from the barrel.
    - Test: size equals `(size + 2 * quietZone) * ppm`, data length equals width x height x 4, every pixel is exactly black or white with alpha 255, the quiet zone is all white [unit].
    - Test: pixels equal the union of `fillRect` calls from the recording fake context of task 1.8 for a v1 and a v10 matrix (ties the Node helper to the renderer logic; the Chromium tie is task 3.5) [unit].
    - _Requirements: 3.1, 13.2_

  - [ ] 1.11 Group 1 checkpoint
    - Run `pnpm lint`, `pnpm typecheck` and `pnpm test` and report the outputs. Confirm `tools/deps.test.ts` passes with the `qr` row.
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 1.14, 10.1, 11.3_

- [ ] 2. Group 2: Wasm loading, frame decoder, decode worker, CSP proof (STOP at the end for the user)
  - [ ] 2.1 Add `zxing-wasm` 3.1.7, `decoder-backend.ts`, `zxing-backend.ts`, `wasm-runtime.ts`
    - Add `zxing-wasm` 3.1.7 to `packages/symbols/package.json` (exact pin) and its row to `docs/dependencies.md` (name, exact version, license, reason) in the same commit. Re-check that the package `exports` include `./reader/zxing_reader.wasm` and `./reader`. If either is absent, STOP and report.
    - `decoder-backend.ts`: internal `DecoderBackend` interface. `zxing-backend.ts`: the only file importing `zxing-wasm/reader`; takes `result.bytes` and copies it out, never reads `result.text`; converts to local types so no zxing type leaks. `wasm-runtime.ts`: `WasmSource` (`url` or `bytes`), `ensureRuntime` memoised per source, `prepareZXingModule` with `locateFile` (url) or `wasmBinary` (bytes), INVALID_INPUT when no source (nothing fetched), UNSUPPORTED_ENVIRONMENT on any load or instantiate failure (memo entry dropped so retry works), a second different source after init rejected with INVALID_INPUT. No CDN default.
    - Tests read the `.wasm` bytes from disk in the TEST (fs through the ambient shim) and pass them as `{ kind: "bytes" }`.
    - Test: no source gives INVALID_INPUT and a stubbed `globalThis.fetch` is never called (R5.8) [unit].
    - Test: a bytes source initialises once; two calls return the same promise, and `prepareZXingModule` ran once (R5.7) [unit].
    - Test: corrupt bytes reject with UNSUPPORTED_ENVIRONMENT, and a later call with good bytes succeeds (R8.5) [unit].
    - Test: a second, different source after a successful init rejects with INVALID_INPUT (R5.7) [unit].
    - Test: static grep shows the default jsDelivr `locateFile` is never left in place: no test path triggers a fetch to any URL (R9.2) [unit].
    - Test: `package.json` lists `zxing-wasm` as exactly `3.1.7`; `tools/deps.test.ts` passes (R11.1, R11.2, R11.3) [unit].
    - Test: the `DecoderBackend` interface is the only seam the runtime exposes to `decode.ts` (R11.6) [unit].
    - _Requirements: 5.7, 5.8, 8.5, 9.2, 11.1, 11.2, 11.3, 11.6_

  - [ ] 2.2 `decode.ts` (`decodeFrame`, outcome types) with P1, P9, P10, P11, P24
    - `decodeFrame(frame, options)`: `assertImageDataLike` first, then the backend. Outcomes `found` (fresh copy of the bytes; `version`, `ecc`, `corners` when reported), `not_found`, `not_strip_packet` (payload longer than 2953 bytes). It never throws for a missing symbol.
    - Test: a rendered symbol decodes to the exact bytes, with `version` and `ecc` reported when the backend gives them (R5.1, R5.2) [unit].
    - Test (P1 unit): all 256 byte values, and the 30-packet codec set (sizes 2953, 1000 and 500, produced by the codec encoder in the test), round-trip byte for byte through `qr`, `matrixToImageData` at 4 ppm and the zxing backend (R1.7, R5.6) [unit].
    - Property P1: **Feature: symbols, Property 1: for any byte array of 1..QR_CAPACITY[ecc] bytes and each ecc, encode, rasterise at 4 ppm, decode with the zxing backend returns identical bytes** (R1.1, R1.7, R1.8, R5.1, R5.6) [property]. Reduced runs: N = 100 total per ecc, because each decode costs milliseconds; fixed seed.
    - Property P9: **Feature: symbols, Property 9: for blank frames of any size and uniform colour and for seeded noise frames, decodeFrame resolves not_found and never throws** (R5.3, R8.2) [property].
    - Property P10: **Feature: symbols, Property 10: for any frame-like value with a wrong type, non-integer or non-positive size, wrong data type or wrong data length, decodeFrame throws SymbolError INVALID_INPUT before the backend is called (fake backend call count 0)** (R5.5, R8.3) [property]. Uses a fake backend.
    - Property P11: **Feature: symbols, Property 11: for any invalid input to any public function, the thrown error is a SymbolError whose code is in SYMBOL_ERROR_CODES; a wasm load failure gives UNSUPPORTED_ENVIRONMENT; a missing wasm source gives INVALID_INPUT** (R5.8, R8.1, R8.3, R8.5, R8.6) [property].
    - Test P24: **Feature: symbols, Property 24: for any payload longer than 2953 bytes in a decoded symbol, the outcome is not_strip_packet** (R5.4) [unit]. Uses a fake backend returning 2954 and larger lengths.
    - Test: `decodeFrame` completes asynchronously and the first call initialises the wasm from the given source (R5.7) [unit].
    - _Requirements: 1.1, 1.7, 1.8, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 8.1, 8.2, 8.3, 8.5, 8.6_

  - [ ] 2.3 `frame-decoder.ts`, `test/helpers/fake-backend.ts`, P12, P13
    - `createFrameDecoder(options)` returns a Promise that resolves after the wasm init (rejects with UNSUPPORTED_ENVIRONMENT on init failure). One staging `Uint8ClampedArray(maxWidth * maxHeight * 4)` allocated at creation and reused. `busy` flag set before the backend call and cleared in `finally`; a `submit` while busy resolves `{ kind: "dropped" }` and holds no pending frame. An oversize frame throws INVALID_INPUT before the busy check. `dispose()`; `submit` after `dispose` throws INVALID_INPUT. `mode` `video` (default) or `photo`.
    - Reader options: `video` is exactly `{ formats: ["QRCode"], tryHarder: true, tryRotate: true, tryDownscale: true, maxNumberOfSymbols: 1, binarizer: "LocalAverage", tryInvert: false }`; `photo` adds `tryInvert: true` and one retry with `GlobalHistogram` on a miss. The benefit of the retry is measured and reported, not gated.
    - `test/helpers/fake-backend.ts`: controllable `DecoderBackend` (resolves on demand, records calls and the buffer it received).
    - Test: the Promise resolves with a decoder after init, and an init failure rejects with UNSUPPORTED_ENVIRONMENT (R7.1) [unit].
    - Test: `mode` defaults to `video`; the fake backend receives exactly the video options; `photo` receives the photo options and performs the `GlobalHistogram` retry once on a miss and not on a hit (R7.2, R7.3) [unit].
    - Test: a frame larger than the maximum throws INVALID_INPUT, even while busy (R7.4) [unit].
    - Test: `submit` while busy resolves `dropped`, the backend call count stays 1, and after the in-flight call resolves the next `submit` runs (R7.10, R7.11) [unit].
    - Test: `dispose` then `submit` throws INVALID_INPUT (R8.3) [unit].
    - Property P12: **Feature: symbols, Property 12: for any sequence of submit calls with a controllable fake backend, at most one backend call is in flight, a call made while one is in flight resolves dropped and never reaches the backend, and after the in-flight decode resolves the next submit runs** (R7.10, R7.11) [property]. Model-based.
    - Property P13: **Feature: symbols, Property 13: for any sequence of frames up to the maximum size, the staging buffer passed to the backend is the same ArrayBuffer every time, and mutating the caller's buffer after submit returns does not change the decode result** (R7.1) [property].
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.10, 7.11, 8.3_

  - [ ] 2.4 Real `wasm-url.ts`, `apps/strip/src/csp.ts`, `symbols-wasm.ts`, headers and harness server
    - Replace the stub: `src/wasm-url.ts` with `import readerWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url"; export { readerWasmUrl };`. Nothing in `src` imports it.
    - `apps/strip/src/csp.ts`: the single source of the Strip_CSP string, exactly `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. `apps/strip/src/symbols-wasm.ts`: `wasmSource = { kind: "url", url: readerWasmUrl } as const` imported from `@strip/symbols/wasm-url`. `apps/strip/vite.config.ts`: `server.headers` and `preview.headers` set `Content-Security-Policy` from `csp.ts`.
    - `apps/strip/e2e-harness/server.ts`: static server for the built harness that sends the CSP header on EVERY response (page, worker JS, `.wasm`), sets `application/wasm` for `.wasm`, logs every request (URL, origin, headers), and can start with an alternative CSP (for the negative test).
    - Test: the string in `csp.ts` equals the R9.3 string character for character (R9.3, R9.7) [unit].
    - Test: the string contains no `'unsafe-eval'` and no `'unsafe-inline'`, contains `'wasm-unsafe-eval'` once, and sets no `img-src`, `worker-src` or `style-src` (R9.4, R9.5) [unit].
    - Test: the header the server sends on a page, a `.js` and a `.wasm` request equals the `csp.ts` string, and the `.wasm` response has `Content-Type: application/wasm` (R9.7) [unit].
    - Test: the Vite config's `server.headers` and `preview.headers` value equals the `csp.ts` string (R9.7) [unit].
    - Test: the `src/index.ts` import graph does not reach `wasm-url.ts` (R10.4, R12.3) [unit].
    - _Requirements: 9.3, 9.4, 9.5, 9.7, 10.4, 12.3_

  - [ ] 2.5 `decode.worker.ts` and `decode-client.ts`
    - `apps/strip/src/decode.worker.ts`: dedicated module worker owning the Frame_Decoder, no `?url` import, with the protocol of design section 6: `init { wasmUrl, maxWidth, maxHeight, mode }` answered by `ready` or `init-error { code, message }`; `frame { id, width, height, buffer }` (transferred) or `bitmap { id, bitmap }` (transferred, drawn to an `OffscreenCanvas` to get RGBA) answered by `outcome { id, outcome }` (`bytes` transferred) or `error { id, code, message }`.
    - `apps/strip/src/decode-client.ts`: main-thread wrapper with an idle flag. A frame is sent only when the worker has reported idle; otherwise the frame is dropped on the main thread without a copy. The `.wasm` URL comes from `symbols-wasm.ts` and is sent in `init`.
    - Test (client logic against a fake `Worker`): a frame submitted while not idle is dropped and nothing is posted; a frame is posted with its buffer in the transfer list; `outcome` and `error` messages mark idle again; `init-error` rejects the ready promise with the given code [unit].
    - Test: the worker file contains no `?url` import and no `self`-free logic leaks into the Frame_Decoder (grep `frame-decoder.ts` for `postMessage` and `self`: zero) (R7.10, R10.4) [unit].
    - _Requirements: 7.9, 7.10, 7.11, 10.4_

  - [ ] 2.6 Playwright tests a, b, c, i (CSP, wasm load, request log, production build)
    - Extend `e2e-harness/index.html` and `main.ts`: encode, render to canvas, decode, and a round trip through the codec. Tests in `apps/strip/e2e/symbols-csp.spec.ts`.
    - Test a: the harness served with the real Strip_CSP header runs encode, canvas render, decode and the round trip with exact bytes; zero `securitypolicyviolation` events and zero console errors or warnings (R9.1, R9.8, P15) [Playwright].
    - Test b: the same page served with a CSP lacking `'wasm-unsafe-eval'` fails with SymbolError code UNSUPPORTED_ENVIRONMENT, which makes test a meaningful (R8.5, R9.4) [Playwright].
    - Test c: the request log of the round trip has only requests to the harness origin, none to any other origin (jsDelivr included), no script loaded or dynamically imported from another origin, and the `.wasm` requested from the same origin; the CSP header is present on the page, worker and `.wasm` responses and equals the R9.3 string; `.wasm` has `Content-Type: application/wasm` (R9.1, R9.2, R9.7, R9.9) [Playwright].
    - Test i: against the production Vite build served by the harness, the URL from `@strip/symbols/wasm-url` matches `^/assets/zxing_reader-[\w-]+\.wasm$`, does not start with `data:`, the decoder loads it and decodes a symbol, and `apps/strip/package.json` has no `zxing-wasm` (R9.10, R11.8) [Playwright].
    - Property P15 and P16 are carried by tests a and c: **Feature: symbols, Property 15: the served Content-Security-Policy header equals the R9.3 string exactly on the page, the worker script and the .wasm, with zero violations and zero console errors** and **Feature: symbols, Property 16: every recorded request goes to the harness origin, none to another origin, and the .wasm is requested from the same origin** [Playwright].
    - Record in the task notes which path was taken (subpath, the default; or the contingency). If test i fails, STOP and report: the contingency needs the user's confirmation (Global rule 3).
    - Run `pnpm test:e2e` and report the output.
    - _Requirements: 8.5, 9.1, 9.2, 9.4, 9.7, 9.8, 9.9, 9.10, 11.8_

  - [ ] 2.7 Playwright test d (worker decode, longtask) and wasm init and size measurement
    - Test d: the worker decodes a sequence of at least 30 rendered frames while a `PerformanceObserver({ type: "longtask" })` runs on the main thread; no entry is over 50 ms attributable to decoding, and all frames decode or drop without error (R7.9, P21) [Playwright]. Property P21: **Feature: symbols, Property 21: while the worker decodes a frame sequence, the main thread records no longtask over 50 ms attributable to decoding** [Playwright]. If the worker cannot start under the Strip_CSP or fails the criterion, STOP and report; the fallback (main-thread decode with a yield per frame) needs the user's confirmation.
    - Measurement script in the harness: wasm init time (compile plus instantiate, timed with the harness's own `performance.now`, which is allowed because it is outside `src` and `apps/strip/src`) in Chromium under the real CSP, repeated 5 times in fresh pages, reporting the median; built `.wasm` size in bytes from the production build. Assertions: init at most 500 ms and size at most 1,000,000 bytes (R7.7, R7.8) [Playwright]. The numbers are printed for the Group 2 checkpoint report.
    - _Requirements: 7.7, 7.8, 7.9_

  - [ ] 2.8 Group 2 checkpoint (STOP for the user)
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:e2e` and report the outputs and test counts.
    - Report the measured wasm init time (Chromium, real CSP), the built `.wasm` size, and which `?url` path was taken (subpath or contingency).
    - STOP. Group 3 does not start until the user approves.
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 7.7, 7.8, 9.8, 9.10_

- [ ] 3. Group 3: Degrader, fixtures, barrel, codec integration, remaining Playwright tests
  - [ ] 3.1 Test helpers `prng.ts`, `wilson.ts`, `degrade.ts`
    - `test/helpers/prng.ts`: seeded mulberry32 and a seed-hash helper over (cell parameters, trial index). `test/helpers/wilson.ts`: Wilson 95% interval lower and upper bound. `test/helpers/degrade.ts`: seeded pure TypeScript port of the spike degrader (render with a 4-module quiet zone onto a grey frame 1.2 x the symbol size, rotation, projective warp, 2x2 supersampling, Gaussian blur, contrast compression, linear brightness gradient, Gaussian noise, clamp and round) with presets `TYPICAL` (rotation ±5°, perspective ±4%, contrast 70%, noise 4%, gradient ±10) and `HARSH` (±10°, ±8%, 50%, 8%, ±16), and parameter hooks for each Degradation_Family (rotation 0..359, perspective angle, blur sigma, brightness fraction plus noise, occlusion fraction as solid block or scattered, inverted polarity). No `Math.random`.
    - Test: Wilson bound at known values (for example 200/200 gives a lower bound near 0.981, 0/0 handled, 100/100 near 0.963) [unit].
    - Test: the PRNG is deterministic per seed and the seed hash differs across cell parameters [unit].
    - Test: `degrade` with the same seed returns byte-identical output, different seeds differ, the output length equals width x height x 4, all values in 0..255, and the frame is 1.2 x the symbol size [unit].
    - Test: each Degradation_Family hook changes the output relative to the identity case, and the identity case with no degradation reproduces the rendered symbol on the grey frame [unit].
    - _Requirements: 6.2, 6.3, 6.5_

  - [ ] 3.2 Degraded fixtures and decode-from-fixture tests
    - `test/fixtures/degraded/recipes.json`: `{ version, ecc, ppm, blur, seed, profile, sha256 }` per case, the sha256 of the expected payload regenerated from the seed. At most 6 gzipped PGM real images of small symbols (about 45 to 65 modules wide, 4 ppm), each under 50 KB gzipped, total under 300 KB.
    - Test: the size budget: no more than 6 PGM files, each at most 50 KB, total at most 300 KB (design Degraded-image fixtures) [unit].
    - Test: every recipe regenerates a payload whose sha256 matches, and the degraded frame decodes to that payload (the recipes are chosen from cells the spike reports as saturated, so they must decode) (R6.2, R6.3) [unit].
    - Test: every real PGM image decodes through the zxing backend to the expected bytes stored beside it (R6.2) [unit].
    - If a recipe or image that must decode does not decode, STOP and report.
    - _Requirements: 6.2, 6.3_

  - [ ] 3.3 Barrel export exactness (P17)
    - `src/index.ts` exports exactly the 11 runtime names: `encodeSymbol`, `renderToCanvas`, `renderToSvg`, `fitScale`, `decodeFrame`, `createFrameDecoder`, `SymbolError`, `SYMBOL_ERROR_CODES`, `QR_CAPACITY`, `QR_CAPACITY_BY_VERSION`, `QR_DEFAULTS`, plus the type-only exports `SymbolMatrix`, `EccLevel`, encode options, render options, decode options (including `WasmSource`), `DecodeOutcome` (including `not_found`), `FrameDecoder` and `SymbolErrorCode`. It does not export `readerWasmUrl`, and no signature mentions a `qr` or `zxing-wasm` type.
    - Test: the runtime export list of the barrel equals the 11 names exactly (R12.1) [unit].
    - Test: the type-only export list contains the types of R12.2, checked with a compile-time test file under `test/types/` (R12.2) [unit].
    - Test: `package.json` `exports` has exactly `.` and `./wasm-url`; the barrel does not export `readerWasmUrl` (R12.3) [unit].
    - Test: the emitted declarations of the barrel (`tsc --declaration` to a temp dir) contain no import from `qr` or `zxing-wasm` (R11.7) [unit].
    - Test P17: **Feature: symbols, Property 17: the runtime export list of the barrel equals exactly the 11 names of R12.1 and does not include readerWasmUrl, package exports has exactly the entries . and ./wasm-url, and no export type or value comes from qr or zxing-wasm** [unit].
    - _Requirements: 11.7, 12.1, 12.2, 12.3_

  - [ ] 3.4 Codec integration (P18) and Playwright h
    - `test/codec-integration.test.ts` (outside `src`, may import runtime values from `@strip/codec`): encode a seeded file at `packetSize` 1732, convert each Packet through `encodeSymbol` and `matrixToImageData`, decode with `decodeFrame`, feed the bytes to the codec decoder, and require completion with identical file bytes.
    - Playwright h in `apps/strip/e2e/symbols-integration.spec.ts`: the same flow through `renderToCanvas` and through `renderToSvg` rasterised in Chromium.
    - Test P18 (Node): **Feature: symbols, Property 18: for any seeded file, each Packet through encodeSymbol, matrixToImageData, decodeFrame and the codec decoder completes with the identical file** (R13.1, R13.2, R1.10) [property]. Small N (a few KB per file, reduced run count stated in the test), fixed seed.
    - Test h: the codec decoder completes with identical bytes through canvas, and through SVG (R13.1) [Playwright].
    - Test: the integration test file is outside `src` (R13.3) [unit].
    - _Requirements: 1.10, 13.1, 13.2, 13.3_

  - [ ] 3.5 Playwright tests e and f (pixels, SVG raster, built wasm, Node-vs-Chromium parity)
    - Test e: canvas pixels in Chromium equal `matrixToImageData` for each of ppm 1..8 and quiet zone 4 and above, and every pixel is exactly the dark or light colour (no blended pixel) (R3.3, R3.4) [Playwright]. Property P6: **Feature: symbols, Property 6: for any matrix, ppm in 1..8 and quiet zone at least 4, canvas pixels in Chromium equal matrixToImageData and every pixel is exactly the dark or light colour** [Playwright], using fast-check with fixed seeds to generate the matrix inputs.
    - Test e (SVG): the SVG rasterised in Chromium decodes to the input bytes, completing P8 (R4.6) [Playwright].
    - Test e (wasm): the built `.wasm` URL is not `data:` and the file is at most 1,000,000 bytes (R7.8) [Playwright].
    - Test f (P23): **Feature: symbols, Property 23: for any fixed set of inputs (seeded bytes at versions 1, 2, 7, 10, 20, 30, 40 and each ecc), the matrices encoded in Node equal the matrices encoded by the same encoder in Chromium** (R10.3) [Playwright]. The Node output is compared with the Chromium output; no reference files are stored.
    - _Requirements: 3.3, 3.4, 4.6, 7.8, 10.3_

  - [ ] 3.6 Group 3 checkpoint
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:e2e` and report the outputs.
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 6.2, 12.1, 13.1_

- [ ] 4. Group 4: Measured gates, perf, notices, README, final verification
  - [ ] 4.1 Measured suite (P14, P25) and informational grids
    - `perf/measured/*.measured.ts`, run by `pnpm test:measured`, printing the observed rate, N and the Wilson lower bound for every cell. Fixed seeds distinct from the fixture seeds. No `Math.random`.
    - Test P14: **Feature: symbols, Property 14: Default_Cell (v30 L, 1732 bytes, 4 ppm, blur 1) under the Typical_Profile, N = 200 fresh seeds, has a Wilson lower bound of at least 0.90 for screen and at least 0.97 for print** (R6.8, R6.9) [measured]. Payloads are 1732 bytes. If a bound is missed, or the rates differ from the spike's beyond the Wilson interval, STOP and report (Global rule 9).
    - Test P25: **Feature: symbols, Property 25: clean fixtures, every version 1..40 at each ecc, at 4 and 8 ppm (320 fixtures), decode to the input in 100% of cases** (R6.1) [measured].
    - Informational (no assertion): Harsh_Profile for the Default_Cell at 4 and 6 ppm and blur 0, 1 and 1.5 (R6.10); 3 ppm at blur 1 printed as a documented limit, expected 0.26 to 0.45 (R6.11); each Degradation_Family as a measured claim with N, rate and Wilson bound per cell (R6.2, R6.3, R6.4, R6.5); a statement in the output that only the Default_Cell cells under the Typical_Profile are asserted (R6.6).
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.9, 6.10, 6.11_

  - [ ] 4.2 Perf scripts
    - `perf/encode.perf.ts`, `perf/decode.perf.ts`, `perf/wasm-init.perf.ts`, `perf/measure.ts` using the Perf_Method (median of 20 runs after 3 warm-ups, `process.hrtime.bigint`), printing frame content, version, ecc and the Reference_Machine note.
    - Test: decode median at most 20 ms for a 1280x720 frame and at most 40 ms for a 1920x1080 frame (R7.5) [perf].
    - Test: encode median at most 5 ms for 1732 bytes at v30 L (R7.6) [perf].
    - Test: wasm init (compile plus instantiate) at most 500 ms in Node (R7.7) [perf].
    - Test: `measure.ts` reports the median of exactly 20 timed runs after 3 warm-ups (unit-tested with an injected clock) [unit].
    - _Requirements: 7.5, 7.6, 7.7_

  - [ ] 4.3 `THIRD_PARTY_NOTICES`, P19 and Playwright g
    - Static committed file `apps/strip/public/THIRD_PARTY_NOTICES` (never generated) with each shipped component's name, exact version, licence and full licence text: `qr` 0.7.2 (MIT), `zxing-wasm` 3.1.7 (MIT), zxing-cpp (Apache-2.0) and the zxing-wasm C++ glue (Apache-2.0), the last two contained in the reader `.wasm`; the full Apache-2.0 text. It does not mention zint.
    - Verify whether zxing-cpp has a `NOTICE` file upstream at the version embedded in the reader `.wasm`. If one exists, reproduce its contents in the file. Record the result of the verification in the task notes (R15.3).
    - Link the file from the app (a link in `apps/strip/index.html` or the about view, same origin).
    - Test P19: **Feature: symbols, Property 19: the static THIRD_PARTY_NOTICES names qr 0.7.2 (MIT), zxing-wasm 3.1.7 (MIT), zxing-cpp (Apache-2.0) and the zxing-wasm C++ glue (Apache-2.0), each with version and licence, contains the Apache-2.0 text, and does not mention zint** (R15.1, R15.2, R15.4) [unit].
    - Test g: the file is served from the same origin and linked from the app (R15.5) [Playwright].
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ] 4.4 README and device-check template
    - `packages/symbols/README.md`: API, `QR_DEFAULTS` (v30, L, 1732, 4 ppm) with the statement that a symbol should fill no more than about 70% of the short side of the camera frame (R14.6), the Latin-1 mapping, the Strip_CSP and the host requirement that the policy is an HTTP header because `frame-ancestors` is ignored in a meta element (R9.6), the `@strip/symbols/wasm-url` subpath and how the app uses it, and the measured claims, each with N and method.
    - `docs/spikes/symbols-device-check.md`: template with device, OS, camera, display or print, distance, symbol version, ppm, mode, result, time per decode, at least one mid-range phone, and the 5 decodes per second check with the assumed 5 to 10 times slowdown (R6.7, R7.12) [manual].
    - Test: the README contains the 70% statement and the CSP header-only statement [unit].
    - _Requirements: 6.7, 7.12, 9.6, 14.6_

  - [ ] 4.5 Verify dependency rows
    - Verify that `docs/dependencies.md` has rows for `qr` 0.7.2 and `zxing-wasm` 3.1.7 (added in tasks 1.5 and 2.1), that `packages/symbols/package.json` lists exactly those two runtime dependencies plus the workspace link to `@strip/codec`, and that `tools/deps.test.ts` passes. If the contingency was taken in 2.6, also verify the `apps/strip` row and the amended R11.8 and R9.10.
    - Test: `tools/deps.test.ts` passes, and a package entry without a row would fail it (mutation example in the test) (R11.3) [unit].
    - Test: both runtime dependencies are exact-pinned (no `^` or `~`) and the writer and full builds of `zxing-wasm` are not imported anywhere in `src` (R11.1, R11.2, R11.4) [unit].
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ] 4.6 Final verification and traceability
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:measured`, `pnpm perf` and `pnpm test:e2e` and report the outputs.
    - Summarise the measured results (P14, P25, informational grids, perf medians, wasm init, `.wasm` size).
    - Verify the traceability table at the end of this file: every requirement id R1.1..R15.5 is in at least one sub-task and every property P1..P26 is in exactly one test sub-task. Report any gap.
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 6.8, 6.9, 7.5, 7.6, 7.7, 9.8, 12.1_

  - [ ] 4.7 Group 4 checkpoint
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:measured`, `pnpm perf` and `pnpm test:e2e` and report the outputs.
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 6.1, 7.5, 15.5_

## Notes

- No task is optional. Every property test is required.
- Group 3 starts only after the user approves at the Group 2 checkpoint (task 2.8).
- Each sub-task cites the criterion ids it covers. The commit for a sub-task ticks its checkbox and names the task id.
- The `wasm-url.ts` file is a placeholder until task 2.4 because the `zxing-wasm` dependency does not exist before task 2.1.
- Property P8 has a Node half (task 1.9) and a Chromium half (a plain Playwright test in task 3.5). The 160-cell unit half of P4 is in task 1.5 and the property half is in task 1.6. P15 and P16 are carried by Playwright tests in task 2.6. The Property tag appears on the test that owns it in the traceability table.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4"] },
    { "id": 4, "tasks": ["1.5"] },
    { "id": 5, "tasks": ["1.6"] },
    { "id": 6, "tasks": ["1.7"] },
    { "id": 7, "tasks": ["1.8"] },
    { "id": 8, "tasks": ["1.9"] },
    { "id": 9, "tasks": ["1.10"] },
    { "id": 10, "tasks": ["1.11"] },
    { "id": 11, "tasks": ["2.1"] },
    { "id": 12, "tasks": ["2.2"] },
    { "id": 13, "tasks": ["2.3"] },
    { "id": 14, "tasks": ["2.4"] },
    { "id": 15, "tasks": ["2.5"] },
    { "id": 16, "tasks": ["2.6"] },
    { "id": 17, "tasks": ["2.7"] },
    { "id": 18, "tasks": ["2.8"] },
    { "id": 19, "tasks": ["3.1"] },
    { "id": 20, "tasks": ["3.2"] },
    { "id": 21, "tasks": ["3.3"] },
    { "id": 22, "tasks": ["3.4"] },
    { "id": 23, "tasks": ["3.5"] },
    { "id": 24, "tasks": ["3.6"] },
    { "id": 25, "tasks": ["4.1"] },
    { "id": 26, "tasks": ["4.2"] },
    { "id": 27, "tasks": ["4.3"] },
    { "id": 28, "tasks": ["4.4"] },
    { "id": 29, "tasks": ["4.5"] },
    { "id": 30, "tasks": ["4.6"] },
    { "id": 31, "tasks": ["4.7"] }
  ]
}
```

## Traceability: properties to test sub-tasks

| Property | Test sub-task | Kind |
|---|---|---|
| P1 | 2.2 | property (reduced runs) + unit |
| P2 | 1.6 | property |
| P3 | 1.6 | property |
| P4 | 1.6 | property (160-cell unit in 1.5) |
| P5 | 1.6 | property |
| P6 | 3.5 | Playwright |
| P7 | 1.7 | property |
| P8 | 1.9 | property (Chromium raster in 3.5) |
| P9 | 2.2 | property |
| P10 | 2.2 | property |
| P11 | 2.2 | property + unit |
| P12 | 2.3 | property |
| P13 | 2.3 | property |
| P14 | 4.1 | measured |
| P15 | 2.6 | Playwright + unit (unit in 2.4) |
| P16 | 2.6 | Playwright |
| P17 | 3.3 | unit |
| P18 | 3.4 | property (small N) + Playwright |
| P19 | 4.3 | unit + Playwright |
| P20 | 1.4 | property |
| P21 | 2.7 | Playwright |
| P22 | 1.8 | property |
| P23 | 3.5 | Playwright |
| P24 | 2.2 | unit |
| P25 | 4.1 | measured |
| P26 | 1.3 | unit |
