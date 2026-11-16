# Implementation Plan: Codec (`@strip/codec`)

## Overview

Six groups, built bottom-up: pure leaf modules, deterministic generation, encoder/decoder/barrel, calibration tooling with a user-approval stop, calibrated table plus golden vectors plus all property tests, then perf, browser and docs. Source goes in `packages/codec/src`. Tests go in `packages/codec/test`. Perf and calibration scripts go in `packages/codec/perf`. Property ids (P1..P13, M1..M3) are the ones in design.md "Correctness properties".

## Global rules

1. **Stop-and-wait.** On any property counterexample, ambiguity, or dependency decision, stop and report. Never work around it.
2. **Credit cap.** 60 credits per group. If a group is projected to exceed it, stop and report before continuing.
3. **Dependencies.** No new dependency without the user's approval and a `docs/dependencies.md` row in the same commit. `packages/codec/package.json` has no `dependencies` key. If tests or perf need Node APIs (`process.hrtime`, `os.cpus`, `fs`), do NOT add `@types/node`. Use the ambient shims `test/node-shim.d.ts` and `perf/node-shim.d.ts`, declaring only the subset used.
4. **Commits.** One commit per sub-task or logical pair, with conventional messages (`feat(codec): ...`, `test(codec): ...`).
5. **Purity.** No `Math.random`, `Date.now` or `performance.now` anywhere in `src`. In `packages/codec/src` also no `Math.log`, `Math.sqrt`, `Math.exp` or `Math.pow`. Tests and perf live outside `src`.
6. **Per-group verification.** After each group run `pnpm lint`, `pnpm typecheck` and `pnpm test`, and report the outputs.
7. **Gating.** Do not start the next group until the previous group's checkpoint passes. Group 5 must not start until the user approves at the Group 4 STOP CHECKPOINT.
8. **Property tag convention.** Every property test carries the comment `Feature: codec, Property N: <text>` and is one test. Non-measured properties use fast-check with the numRuns given in the task and fast-check's default seeding, with the seed reported on failure. Measured properties M1..M3 use fixed seeds distinct from the calibration seeds.

## Tasks

- [ ] 1. Group 1: Foundations (pure leaf modules, unit tests only)
  - [ ] 1.1 Package test tooling and static checks
    - Add the `packages/codec` vitest config, a `tsconfig` for `src` with `lib: ["ES2023"]`, no DOM and no Node types, and a separate tsconfig for `test` and `perf` that includes the ambient shims `test/node-shim.d.ts` and `perf/node-shim.d.ts`.
    - Make the package `typecheck` script cover both tsconfigs.
    - Test: `src` compiles with zero errors without DOM (R9.4).
    - Test: `packages/codec/package.json` has no `dependencies` key (R9.6, R9.7).
    - _Requirements: 9.4, 9.6, 9.7_

  - [ ] 1.2 `constants.ts` and `errors.ts`
    - Constants: `MAGIC`, `FORMAT_VERSION`, `HEADER_SIZE`, `CRC_SIZE`, and the defaults (packetSize 2953, maxPayloadBytes 33554432, maxBlockCount 16384, maxGaussianBlocks 1024).
    - Errors: `ERROR_CODES` (exactly ten), `ErrorCode`, `IgnoreReason` (DUPLICATE_PACKET, SESSION_MISMATCH, ALREADY_COMPLETE), `CodecError` with `code` and a non-empty message.
    - Unit tests for the exact ten codes, `instanceof` and the non-empty message.
    - _Requirements: 7.1, 7.2, 7.5, 7.6, 3.4_

  - [ ] 1.3 `crc32.ts`
    - Table-driven IEEE CRC-32.
    - Unit tests with the design vectors: `crc32("123456789") = 0xCBF43926`, empty input = `0x00000000`, bytes 0..31 = `0x91267E8A`.
    - _Requirements: 3.1, 3.2_

  - [ ] 1.4 `prng.ts`
    - SplitMix32 seeding, xoshiro128** and `bounded(n)`, including n = 1 (no draw) and n = 2^32 (full range).
    - Unit tests with the three design vectors (seed32, state and the first 4 outputs).
    - Unit test that two initializations with the same (sessionId, seq) give identical output for the first 1,000 values.
    - _Requirements: 6.2, 6.3_

  - [ ] 1.5 `header.ts` and `packet.ts`
    - Implement `encodePacket` and `decodePacket` with the 26-byte big-endian header, header CRC over the first 22 bytes, and the trailing CRC.
    - Implement the 9-step check order from the design table. Limits are checked before any buffer sized from L or K is allocated.
    - Unit tests: each failure code (BAD_HEADER, BAD_CRC, UNSUPPORTED_VERSION, PAYLOAD_TOO_LARGE, TOO_MANY_BLOCKS), the ordering rules (the header CRC wins over every later defect, version only after the magic check, L before K), the K != ceil(L / blockSize) case, and the blockSize 16 and 65535 bounds.
    - Unit test that no buffer sized from L or K is allocated on a limit failure.
    - Exhaustive single-bit-flip unit test over a small Packet.
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.16_

  - [ ] 1.6 `validate.ts`
    - Hand-written validators that throw `CodecError` (INVALID_INPUT) for `packetSize` (integer in [46, 65565]), `repairCount`, `maxPayloadBytes`, `maxBlockCount`, `maxGaussianBlocks`, `hash`, payload shape and packet bytes.
    - Unit tests for boundaries and invalid types.
    - _Requirements: 3.5, 4.6, 7.1, 7.2, 5.9, 9.2, 9.3_

  - [ ] 1.7 `metadata.ts`
    - Hand-written UTF-8 codec that rejects lone surrogates, overlong forms and invalid sequences.
    - `serializeMetadata`, `parseMetadata` and `readRecordLength`.
    - Unit tests for the field layout, every R1 rejection (name rules, MIME rules, truncation, trailing bytes, length overrun, unsupported version), the empty payload record, and `readRecordLength` ignoring trailing Payload bytes.
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 1.12_

  - [ ] 1.8 Extend the purity script and tools tests
    - Extend `.kiro/hooks/scripts/purity.mjs` so `packages/codec/src` also bans `Math.log`, `Math.sqrt`, `Math.exp` and `Math.pow`. The other packages keep the original three bans.
    - Add tests under `tools/` for both behaviours.
    - Add a codec test that scans every file under `src` and reports zero banned symbols.
    - _Requirements: 6.2, 6.5, 6.6_

  - [ ] 1.9 Group 1 checkpoint
    - Run `pnpm lint`, `pnpm typecheck` and `pnpm test` and report the outputs.
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 6.5, 9.4_

- [ ] 2. Group 2: Generation (parameterised, no golden vectors committed)
  - [ ] 2.1 `soliton.ts`
    - Implement BigInt fixed point (F = 2^48) with `isqrt`, `lnQ` and the table build, parameterised by (c, delta) as rational numbers. The table is cached by K.
    - Put `SOLITON_C = 1/10` and `SOLITON_DELTA = 1/2` in `constants.ts` as provisional defaults, marked PROVISIONAL until Group 5.
    - Unit tests (the tests may use `Math.log`): `lnQ` matches `Math.log` within 2^-40.
    - Unit tests for the structural invariants: the table is monotone, `cumT[K] = 2^32`, K = 1 always gives degree 1, and the sizes are correct.
    - Do NOT commit golden vectors in this group.
    - _Requirements: 2.2, 6.2_

  - [ ] 2.2 `neighbors.ts`
    - Implement `seed32`, degree sampling by binary search on `cumT`, partial Fisher-Yates with an undo log, and `seq < K` returning `{seq}` without using the PRNG. Take the soliton table as a parameter.
    - Unit tests for purity and determinism, distinct values, range [0, K), degree in [1, K], and systematic Packets.
    - Do NOT commit golden vectors in this group.
    - _Requirements: 2.3, 2.4, 6.2_

  - [ ] 2.3 `xor.ts` and stride helpers
    - Implement `xorInto` with `Uint32Array` views plus a byte tail, and stride helpers (`ceil(blockSize / 4) * 4`).
    - Unit tests for unaligned blockSize values 16, 17, 18, 19 and 2923, compared against a naive byte XOR.
    - _Requirements: 2.1, 2.3_

  - [ ] 2.4 Group 2 checkpoint
    - Run `pnpm lint`, `pnpm typecheck` and `pnpm test` and report the outputs.
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 6.5_

- [ ] 3. Group 3: Encoder, decoder, hash and barrel (no golden vectors, no calibrated numbers)
  - [ ] 3.1 `hash.ts`
    - Implement `HashFn` and `sha256WebCrypto` using `globalThis.crypto.subtle`.
    - Unit tests: a 32-byte digest, known SHA-256 vectors including empty input, and both a sync and an async `HashFn` accepted.
    - _Requirements: 1.9, 1.10_

  - [ ] 3.2 `overhead.ts` and the provisional table
    - Implement `fLatePermille`, `fColdPermille`, `lateCount`, `coldLimit` and `R` with integer linear interpolation (ceil) and clamping outside [10, 2000]. Keep it internal, not in the barrel.
    - Commit `src/overhead-table.json` with `"provisional": true` and conservative placeholder values for K in {10, 25, 50, 100, 250, 500, 1000, 2000}. These values are never used for claims.
    - Unit tests for interpolation examples, clamping, the table K values and integer outputs.
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ] 3.3 `encoder.ts`
    - `encode()`: validate, hash, build the record, take the session id, build the strided buffer, check limits (PAYLOAD_TOO_LARGE, TOO_MANY_BLOCKS).
    - `next()` is synchronous, goes 0..K-1 then K, K+1, ..., and wraps from 2^32 - 1 to K.
    - `page()` is synchronous, returns K + repairCount Packets (default `R(K)`), and validates a configured repairCount without changing state.
    - Unit tests: the packetSize option and bounds, limit boundaries (equal to the limit is accepted), the seq wrap, `page()` ordering and count, repairCount validation, determinism of the first 3K Packets, and the empty payload.
    - _Requirements: 1.2, 1.8, 2.1, 2.3, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 7.3, 7.4_

  - [ ] 3.4 `decoder.ts` (a): state, push flow and session handling
    - Implement the state structures: params, `blocks`, `solved`, the equation slab, adjacency and the `seen` set.
    - Push flow: `decodePacket` with limits, the first Packet fixes the session, SESSION_MISMATCH and DUPLICATE_PACKET are ignored, inconsistent params are rejected with BAD_HEADER, ALREADY_COMPLETE, and progress fields.
    - Memory bound: at most `2K + 64` stored equations. Packets beyond that are counted as distinct but their values are dropped.
    - Packet-level problems are returned in the status, never thrown, and leave state unchanged.
    - Unit tests for each status and for state unchanged on ignore and reject.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.17, 7.7_

  - [ ] 3.5 `decoder.ts` (b): peeling
    - Implement peeling with adjacency lists and a ripple queue.
    - Peeling-only completion does not run Gaussian elimination.
    - When peeling stalls and the residual exceeds `maxGaussianBlocks`, keep collecting Packets with no error and no `rejected` status.
    - Unit tests: peeling-only completion (a spy confirms no GE call), the over-cap residual, and solved-block bookkeeping.
    - _Requirements: 5.7, 5.15, 5.16, 2.6_

  - [ ] 3.6 `gauss.ts` and completion
    - `gauss.ts`: GF(2) elimination on bitset rows. Phase A finds rank on a copy. Phase B solves at full rank. The retry backoff is `max(1, U - r)` further equations. Default `maxGaussianBlocks` is 1024, configurable.
    - Completion: assemble the Coded_Stream, `readRecordLength`, `parseMetadata`, `await hash`, then compare hash and length.
    - On a match set `complete`. On a mismatch enter the terminal HASH_MISMATCH state with the bytes withheld.
    - `result()` throws INCOMPLETE_DECODE before completion.
    - Serialize overlapping `push` calls with an internal promise chain.
    - Unit tests: GE trigger and rank-deficient retry, cap 0 and cap 1024 behaviour, HASH_MISMATCH with an injected wrong-digest HashFn, `result()` before completion, and concurrent pushes.
    - _Requirements: 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 1.12_

  - [ ] 3.7 `index.ts` barrel
    - Export exactly the nine runtime symbols and the thirteen type-only exports listed in design.md.
    - Unit test that asserts the runtime export list and the type export list (R9.1).
    - _Requirements: 9.1, 9.6_

  - [ ] 3.8 End-to-end unit tests
    - Round trip with all systematic Packets, drop and duplicate Packets, a foreign session, a corrupted Packet, the empty payload, K = 1, and tiny blockSize (packetSize 46).
    - _Requirements: 1.8, 2.5, 2.6, 5.3, 5.4, 5.10, 5.12, 7.7_

  - [ ] 3.9 Group 3 checkpoint
    - Run `pnpm lint`, `pnpm typecheck` and `pnpm test` and report the outputs.
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 6.5, 9.4_

- [ ] 4. Group 4: Calibration tooling and c/delta sweep
  - [ ] 4.1 `perf/calibrate.ts`
    - Seeded through `prng.ts`, using the real encoder and decoder with `sha256WebCrypto`. Payload bytes vary per trial. `packetSize` 62 (blockSize 32).
    - Simulate M1 (repair-only shuffle of seq K..5K-1, 4K cap), M2 (loss `next() < 1288490189`, 20K cap) and M3 (loss `next() < 214748365`).
    - Take the 0.995 quantile, round factors up to permille, and floor R at 0.
    - If any quantile is Infinity, exit non-zero, print the failing K and write nothing.
    - Print the table with a Wilson lower bound per cell.
    - Write the JSON only with `--write`. Accept `--c` and `--delta` as rationals, `--K` as a list and `--samples`.
    - _Requirements: 10.4, 2.7, 2.8, 4.7_

  - [ ] 4.2 Calibration determinism test
    - Unit test that two runs with identical arguments (small K list and sample count) produce identical output.
    - _Requirements: 10.4_

  - [ ] 4.3 `perf/sweep.ts`
    - Run c in {0.03, 0.1, 0.2} x delta in {0.5, 0.1, 0.01} on the real implementation for K in {50, 100, 500}.
    - Print per pair f_late and f_cold, plus R at loss 0.05 for information.
    - State the trial counts in the output: N = 1000 for K = 50 and 100, N = 500 for K = 500.
    - Print a recommendation: lowest summed f_cold over the three K, tie-break lowest summed f_late.
    - Write results only to the git-ignored `perf/out/` directory. Add it to `.gitignore`.
    - _Requirements: 2.2, 2.7, 2.8, 10.4_

  - [ ] 4.4 Run the sweep and capture the table
    - Run the sweep, save the full output under `perf/out/`, and keep the table for the report.
    - Run `pnpm lint`, `pnpm typecheck` and `pnpm test` and report the outputs.
    - Do not freeze c/delta, do not generate `overhead-table.json`, do not commit golden vectors.
    - _Requirements: 2.2, 2.7, 2.8_

  - [ ] 4.5 STOP CHECKPOINT: report the c/delta sweep and wait for approval
    - Report the full sweep table (f_late and f_cold at K = 50, 100, 500 per pair), the recommended pair, and any pair or claim that looks unreachable.
    - The user may instead choose to change the code design at this checkpoint (see design Risk 1).
    - Then STOP and wait for the user's approval. Do not freeze c/delta, do not generate `overhead-table.json`, do not commit golden vectors, and do not start Group 5 until the user answers.
    - _Requirements: 2.2, 2.9_

- [ ] 5. Group 5: Freeze, calibrate, golden vectors and all properties (only after approval)
  - [ ] 5.1 Freeze the approved c/delta
    - Set the approved values in `constants.ts` and remove the PROVISIONAL marking.
    - _Requirements: 2.2_

  - [ ] 5.2 Calibrate and commit `overhead-table.json`
    - Run `calibrate --write` for K in {10, 25, 50, 100, 250, 500, 1000, 2000} with the committed seeds. Commit the table without the `provisional` flag.
    - Add the unit test that a fresh calibration for K in {10, 25, 50} (with the table's N_cal) equals the committed rows.
    - _Requirements: 10.2, 10.4, 10.5_

  - [ ] 5.3 Golden vectors from an independent reference
    - Write a standalone Python 3 generator under `packages/codec/test/golden/reference/`, from design.md only. It uses `hashlib` SHA-256, `zlib` CRC-32, and its own SplitMix32, xoshiro128** and integer fixed-point soliton.
    - It outputs `vectors.json` with a fixed payload, name, MIME and options, sessionId, K, the hex of the first Packets, neighbor sets for several seq, PRNG vectors and CRC vectors.
    - Compare with the TypeScript implementation. If they differ, STOP and report, and do not adjust either side to match.
    - Commit `vectors.json` and the golden test that fails on any count or byte difference.
    - _Requirements: 6.3, 6.4_

  - [ ] 5.4 P1: round trip of systematic Packets
    - **Property 1** (design P1). numRuns 200. Length 0..70000 mixing `uint8Array` and lengths around multiples of blockSize, packetSize in 46..400 or default, name and MIME arbitraries.
    - Tag: `Feature: codec, Property 1: shuffled systematic Packets recover identical bytes and Metadata`.
    - **Validates: Requirements 1.2, 1.8, 2.5, 5.12**
    - _Requirements: 1.2, 1.8, 2.5, 5.12_

  - [ ] 5.5 P2: Gaussian cap and completion
    - **Property 2** (design P2). numRuns 200. maxGaussianBlocks 0..10, K 20..60, shuffled loss-free sufficient set, blockSize 32.
    - Tag: `Feature: codec, Property 2: completion with any cap, ALREADY_COMPLETE leaves state deep-equal`.
    - **Validates: Requirements 5.8, 5.9, 5.15, 5.16, 5.17**
    - _Requirements: 5.8, 5.9, 5.15, 5.16, 5.17_

  - [ ] 5.6 P3: order independence
    - **Property 3** (design P3). numRuns 200. Two permutations of a sufficient Packet set from P1.
    - Tag: `Feature: codec, Property 3: any two permutations recover equal bytes`.
    - **Validates: Requirements 5.14**
    - _Requirements: 5.14_

  - [ ] 5.7 P4: duplicates and foreign sessions
    - **Property 4** (design P4). numRuns 200. Interleaved duplicates and foreign-session Packets.
    - Tag: `Feature: codec, Property 4: duplicates and foreign Packets leave state unchanged and the result is correct`.
    - **Validates: Requirements 2.6, 5.3, 5.4**
    - _Requirements: 2.6, 5.3, 5.4_

  - [ ] 5.8 P5: single-bit corruption detection
    - **Property 5** (design P5). numRuns 1000. `fc.nat` over the bit index of a valid Packet, with `decodePacket` failing and `push` returning `rejected`.
    - Tag: `Feature: codec, Property 5: any single flipped bit is rejected`.
    - **Validates: Requirements 3.9**
    - _Requirements: 3.9_

  - [ ] 5.9 P6: Packet round trip
    - **Property 6** (design P6). numRuns 500. Valid header and payload field ranges.
    - Tag: `Feature: codec, Property 6: decodePacket(encodePacket(p)) equals p`.
    - **Validates: Requirements 3.1, 3.15**
    - _Requirements: 3.1, 3.15_

  - [ ] 5.10 P7a: Metadata round trip
    - **Property 7a** (design P7a). numRuns 500. Valid Metadata including unicode names.
    - Tag: `Feature: codec, Property 7a: parseMetadata(serializeMetadata(m)) equals m`.
    - **Validates: Requirements 1.3**
    - _Requirements: 1.3_

  - [ ] 5.11 P7b: invalid names rejected
    - **Property 7b** (design P7b). numRuns 500. Class-specific generators: empty, 256+ bytes, `/`, `\`, NUL, control characters, `.`, `..`.
    - Tag: `Feature: codec, Property 7b: invalid names throw BAD_METADATA`.
    - **Validates: Requirements 1.4**
    - _Requirements: 1.4_

  - [ ] 5.12 P7c: mutated records rejected
    - **Property 7c** (design P7c). numRuns 500. Truncation, appended bytes and corrupted length fields.
    - Tag: `Feature: codec, Property 7c: mutated records throw BAD_METADATA`.
    - **Validates: Requirements 1.6**
    - _Requirements: 1.6_

  - [ ] 5.13 P8: determinism of encoding
    - **Property 8** (design P8). numRuns 100. Same generators as P1. Two independent `encode` calls give identical bytes for the first 3K Packets and identical `page()`.
    - Tag: `Feature: codec, Property 8: identical input gives identical Packet bytes`.
    - **Validates: Requirements 4.1, 6.1**
    - _Requirements: 4.1, 6.1_

  - [ ] 5.14 P9: progress monotonicity and hash gating
    - **Property 9** (design P9). numRuns 200. Random push sequences with duplicates and foreign Packets, and a call-recording HashFn. An injected wrong-digest HashFn gives HASH_MISMATCH with `complete` false.
    - Tag: `Feature: codec, Property 9: progress is monotone and complete iff solved and hash verified`.
    - **Validates: Requirements 5.6, 5.10, 5.11**
    - _Requirements: 5.6, 5.10, 5.11_

  - [ ] 5.15 P10: neighbor selection
    - **Property 10** (design P10). numRuns 500. Random (sessionId, seq, K) triples: pure, d distinct values in [0, K) with d in [1, K], and a systematic seq i gives {i}.
    - Tag: `Feature: codec, Property 10: neighbors are pure, distinct and in range`.
    - **Validates: Requirements 2.3, 2.4, 6.2**
    - _Requirements: 2.3, 2.4, 6.2_

  - [ ] 5.16 P11: push never throws on arbitrary bytes
    - **Property 11** (design P11). numRuns 500. Random bytes and mutated valid Packets. `push` never throws, a `rejected` status carries a valid ErrorCode, and the progress snapshot is unchanged. This validates public-API rejection behaviour.
    - Tag: `Feature: codec, Property 11: push never throws and leaves state unchanged on bad input`.
    - **Validates: Requirements 7.7, 9.2**
    - _Requirements: 7.7, 9.2_

  - [ ] 5.17 P12: overhead interpolation
    - **Property 12** (design P12). numRuns 300. `fc.integer(1, 5000)`: integer outputs, R >= 0, the table value at table K, linear in between within ceil rounding, clamped outside [10, 2000].
    - Tag: `Feature: codec, Property 12: overhead values interpolate linearly and clamp`.
    - **Validates: Requirements 10.3**
    - _Requirements: 10.3_

  - [ ] 5.18 P13: invalid input rejected without partial effect
    - **Property 13** (design P13). numRuns 300. Invalid options and shapes throw `CodecError` (INVALID_INPUT or a more specific code) and leave existing Encoder and Decoder state unchanged. This validates public-API rejection behaviour.
    - Tag: `Feature: codec, Property 13: invalid input throws CodecError with no partial effect`.
    - **Validates: Requirements 9.2, 9.3**
    - _Requirements: 9.2, 9.3_

  - [ ] 5.19 M1: late join
    - **Property M1** (design M1). N = 1000 trials per K in {50, 100, 500}, fixed fast-check seed distinct from the calibration seed, payload varied per trial, blockSize 32.
    - Pool is repair seq K..5K-1. Assert at the table value: subset size `ceil(f_late x K)` completes in >= 0.99 of trials. Report f_late, the observed rate and the Wilson lower bound per K.
    - Tag: `Feature: codec, Property M1: late-join repair-only subsets complete`.
    - If any observed rate is below 0.99, STOP and report per R2.9. Never loosen the bound, never hand-edit the table, never recalibrate silently.
    - **Validates: Requirements 2.7, 2.9, 10.6**
    - _Requirements: 2.7, 2.9, 10.6_

  - [ ] 5.20 M2: cold start with 30% loss
    - **Property M2** (design M2). Same N, K values and seed policy as M1.
    - Stream from seq 0 with loss 0.30. Assert received count <= `ceil(f_cold x K)` in >= 0.99 of trials. Report f_cold, the observed rate and the Wilson lower bound per K.
    - Tag: `Feature: codec, Property M2: cold start with 30% loss completes within f_cold x K`.
    - If any observed rate is below 0.99, STOP and report per R2.9. Never loosen the bound, never hand-edit the table, never recalibrate silently.
    - **Validates: Requirements 2.8, 2.9, 10.6**
    - _Requirements: 2.8, 2.9, 10.6_

  - [ ] 5.21 M3: Page_Mode with 5% loss
    - **Property M3** (design M3). Same N, K values and seed policy as M1.
    - The default `page()` of T = K + R(K) Packets with loss 0.05 completes in >= 0.99 of trials. Report R(K), the observed rate and the Wilson lower bound per K. Also report success at loss 0.02 and 0.10 as informational output with no assertion.
    - Tag: `Feature: codec, Property M3: default page completes under 5% loss`.
    - If any observed rate is below 0.99, STOP and report per R2.9. Never loosen the bound, never hand-edit the table, never recalibrate silently.
    - **Validates: Requirements 4.7, 2.9, 10.6**
    - _Requirements: 4.7, 2.9, 10.6_

  - [ ] 5.22 Full-suite checkpoint
    - Run `pnpm lint`, `pnpm typecheck` and `pnpm test` and report the outputs.
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 2.9, 6.4, 10.5_

  - [ ] 5.23 Runtime check of `test:measured`
    - Time `test:measured` and the default `pnpm test`. If the default `pnpm test` exceeds 60 s, stop and report the exception per the design.
    - _Requirements: 2.7, 2.8, 4.7_

- [ ] 6. Group 6: Perf, browser and docs
  - [ ] 6.1 Perf tests under `packages/codec/perf`
    - Method: 3 discarded warm-ups, 20 timed runs, `process.hrtime.bigint`. Output the Node version, the CPU model and the p95 (the 19th sorted value), and use the same seed and input every run.
    - Encode a 1 MiB seeded input with median < 200 ms.
    - Decode fixture (a), the K systematic Packets, and fixture (b), `ceil(f_late x K)` seeded random repair Packets, each with median < 500 ms and output identical to the input in every run.
    - On a budget miss, fail and print the measured median and the budget. If fixture (b) exceeds its budget, STOP and report per R8.6.
    - Report encode and decode for a 32 MiB payload with no assertion.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ] 6.2 Playwright Chromium check
    - Create a tiny Vite-served harness page in `apps/strip/e2e-harness` that imports the codec through its barrel.
    - Add a test in `apps/strip/e2e` that compares Default_Hash parity with Node (including empty input) and golden-vector Packet bytes against `vectors.json`, plus a Payload round trip.
    - Document `pnpm exec playwright install chromium` as a step. If it prompts for anything or fails, STOP and report.
    - _Requirements: 1.11, 9.5_

  - [ ] 6.3 Dependency log consistency test
    - Add a test under `tools/` that every dependency in every `package.json` is exact-pinned and has a row in `docs/dependencies.md`, and that `packages/codec` has no `dependencies` key.
    - _Requirements: 9.6, 9.7_

  - [ ] 6.4 `packages/codec/README.md`
    - Cover usage of `encode` and `createDecoder`, a packet format summary, and the measured M1 to M3 table from `overhead-table.json` with N and Wilson bounds.
    - Include the no-fixed-overhead note and the non-goals.
    - _Requirements: 2.7, 2.8, 4.7, 10.2_

  - [ ] 6.5 Final verification
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:e2e`, and report the outputs.
    - Summarize the measured results (M1 to M3, perf medians).
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 2.9, 6.5, 8.3, 9.5_

## Notes

- No task is optional. Every property test is required.
- Group 5 starts only after the user approves at the Group 4 STOP CHECKPOINT (task 4.5).
- Each task cites the criterion ids it covers.

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
    { "id": 9, "tasks": ["2.1"] },
    { "id": 10, "tasks": ["2.2"] },
    { "id": 11, "tasks": ["2.3"] },
    { "id": 12, "tasks": ["2.4"] },
    { "id": 13, "tasks": ["3.1"] },
    { "id": 14, "tasks": ["3.2"] },
    { "id": 15, "tasks": ["3.3"] },
    { "id": 16, "tasks": ["3.4"] },
    { "id": 17, "tasks": ["3.5"] },
    { "id": 18, "tasks": ["3.6"] },
    { "id": 19, "tasks": ["3.7"] },
    { "id": 20, "tasks": ["3.8"] },
    { "id": 21, "tasks": ["3.9"] },
    { "id": 22, "tasks": ["4.1"] },
    { "id": 23, "tasks": ["4.2"] },
    { "id": 24, "tasks": ["4.3"] },
    { "id": 25, "tasks": ["4.4"] },
    { "id": 26, "tasks": ["4.5"] },
    { "id": 27, "tasks": ["5.1"] },
    { "id": 28, "tasks": ["5.2"] },
    { "id": 29, "tasks": ["5.3"] },
    { "id": 30, "tasks": ["5.4"] },
    { "id": 31, "tasks": ["5.5"] },
    { "id": 32, "tasks": ["5.6"] },
    { "id": 33, "tasks": ["5.7"] },
    { "id": 34, "tasks": ["5.8"] },
    { "id": 35, "tasks": ["5.9"] },
    { "id": 36, "tasks": ["5.10"] },
    { "id": 37, "tasks": ["5.11"] },
    { "id": 38, "tasks": ["5.12"] },
    { "id": 39, "tasks": ["5.13"] },
    { "id": 40, "tasks": ["5.14"] },
    { "id": 41, "tasks": ["5.15"] },
    { "id": 42, "tasks": ["5.16"] },
    { "id": 43, "tasks": ["5.17"] },
    { "id": 44, "tasks": ["5.18"] },
    { "id": 45, "tasks": ["5.19"] },
    { "id": 46, "tasks": ["5.20"] },
    { "id": 47, "tasks": ["5.21"] },
    { "id": 48, "tasks": ["5.22"] },
    { "id": 49, "tasks": ["5.23"] },
    { "id": 50, "tasks": ["6.1"] },
    { "id": 51, "tasks": ["6.2"] },
    { "id": 52, "tasks": ["6.3"] },
    { "id": 53, "tasks": ["6.4"] },
    { "id": 54, "tasks": ["6.5"] }
  ]
}
```
