# Implementation Plan: Codec (`@strip/codec`)

## Overview

Six groups, built bottom-up: pure leaf modules, deterministic generation (sparse and dense), encoder/decoder/barrel including the dense-row path, calibration tooling with a user-approval stop, calibrated table plus golden vectors plus all property tests, then perf, browser and docs. Source goes in `packages/codec/src`. Tests go in `packages/codec/test`. Perf and calibration scripts go in `packages/codec/perf`. Property ids (P1..P16, M1..M3) are the ones in design.md "Correctness properties". Dense repair rows are part of the format: repair Packet with j = seq - K is dense iff D > 0 and j mod D == D - 1. D (`DENSE_PERIOD`) starts at a PROVISIONAL 4 and is frozen, together with c and delta, only after the user approves at the Group 4 STOP CHECKPOINT.

## Global rules

1. **Stop-and-wait.** On any property counterexample, ambiguity, or dependency decision, stop and report. Never work around it.
2. **Credit cap.** 60 credits per group. If a group is projected to exceed it, stop and report before continuing.
3. **Dependencies.** No new dependency without the user's approval and a `docs/dependencies.md` row in the same commit. `packages/codec/package.json` has no `dependencies` key. If tests or perf need Node APIs (`process.hrtime`, `os.cpus`, `fs`), do NOT add `@types/node`. Use the ambient shims `test/node-shim.d.ts` and `perf/node-shim.d.ts`, declaring only the subset used.
4. **Commits.** One commit per sub-task or logical pair, with conventional messages (`feat(codec): ...`, `test(codec): ...`).
5. **Purity.** No `Math.random`, `Date.now` or `performance.now` anywhere in `src`. In `packages/codec/src` also no `Math.log`, `Math.sqrt`, `Math.exp` or `Math.pow`. Tests and perf live outside `src`.
6. **Per-group verification.** After each group run `pnpm lint`, `pnpm typecheck` and `pnpm test`, and report the outputs.
7. **Gating.** Do not start the next group until the previous group's checkpoint passes. Group 5 must not start until the user approves at the Group 4 STOP CHECKPOINT.
8. **Property tag convention.** Every property test carries the comment `Feature: codec, Property N: <text>` and is one test. Non-measured properties use fast-check with the numRuns given in the task and fast-check's default seeding, with the seed reported on failure. Measured properties M1..M3 use fixed seeds distinct from the calibration seeds.
9. **Provisional format constants.** `SOLITON_C`, `SOLITON_DELTA` and `DENSE_PERIOD` stay marked PROVISIONAL until task 5.1. No golden vector JSON and no non-provisional `overhead-table.json` is committed before then. Design reference-vector rows may appear as unit-test examples earlier, because they test the algorithm and not a frozen value of D.

## Tasks

- [x] 1. Group 1: Foundations (pure leaf modules, unit tests only)
  - [x] 1.1 Package test tooling and static checks
    - Add the `packages/codec` vitest config, a `tsconfig` for `src` with `lib: ["ES2023"]`, no DOM and no Node types, and a separate tsconfig for `test` and `perf` that includes the ambient shims `test/node-shim.d.ts` and `perf/node-shim.d.ts`.
    - Make the package `typecheck` script cover both tsconfigs.
    - Test: `src` compiles with zero errors without DOM (R9.4).
    - Test: `packages/codec/package.json` has no `dependencies` key (R9.6, R9.7).
    - _Requirements: 9.4, 9.6, 9.7_

  - [x] 1.2 `constants.ts` and `errors.ts`
    - Constants: `MAGIC`, `FORMAT_VERSION`, `HEADER_SIZE`, `CRC_SIZE`, and the defaults (packetSize 2953, maxPayloadBytes 33554432, maxBlockCount 16384, maxGaussianBlocks 1024).
    - Errors: `ERROR_CODES` (exactly ten), `ErrorCode`, `IgnoreReason` (exactly DUPLICATE_PACKET, SESSION_MISMATCH, ALREADY_COMPLETE, DENSE_STORE_FULL), `CodecError` with `code` and a non-empty message.
    - Unit tests for the exact ten codes, the exact four ignore reasons, `instanceof` and the non-empty message.
    - _Requirements: 7.1, 7.2, 7.5, 7.6, 3.4, 5.20_

  - [x] 1.3 `crc32.ts`
    - Table-driven IEEE CRC-32.
    - Unit tests with the design vectors: `crc32("123456789") = 0xCBF43926`, empty input = `0x00000000`, bytes 0..31 = `0x91267E8A`.
    - _Requirements: 3.1, 3.2_

  - [x] 1.4 `prng.ts`
    - SplitMix32 seeding, xoshiro128** and `bounded(n)`, including n = 1 (no draw) and n = 2^32 (full range).
    - Unit tests with the three design vectors (seed32, state and the first 4 outputs).
    - Unit test that two initializations with the same (sessionId, seq) give identical output for the first 1,000 values.
    - _Requirements: 6.2, 6.3_

  - [x] 1.5 `header.ts` and `packet.ts`
    - Implement `encodePacket` and `decodePacket` with the 26-byte big-endian header, header CRC over the first 22 bytes, and the trailing CRC.
    - Implement the 9-step check order from the design table. Limits are checked before any buffer sized from L or K is allocated.
    - Unit tests: each failure code (BAD_HEADER, BAD_CRC, UNSUPPORTED_VERSION, PAYLOAD_TOO_LARGE, TOO_MANY_BLOCKS), the ordering rules (the header CRC wins over every later defect, version only after the magic check, L before K), the K != ceil(L / blockSize) case, and the blockSize 16 and 65535 bounds.
    - Unit test that no buffer sized from L or K is allocated on a limit failure.
    - Exhaustive single-bit-flip unit test over a small Packet.
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.16_

  - [x] 1.6 `validate.ts`
    - Hand-written validators that throw `CodecError` (INVALID_INPUT) for `packetSize` (integer in [46, 65565]), `repairCount`, `maxPayloadBytes`, `maxBlockCount`, `maxGaussianBlocks`, `hash`, payload shape and packet bytes.
    - Unit tests for boundaries and invalid types.
    - _Requirements: 3.5, 4.6, 7.1, 7.2, 5.9, 9.2, 9.3_

  - [x] 1.7 `metadata.ts`
    - Hand-written UTF-8 codec that rejects lone surrogates, overlong forms and invalid sequences.
    - `serializeMetadata`, `parseMetadata` and `readRecordLength`.
    - Unit tests for the field layout, every R1 rejection (name rules, MIME rules, truncation, trailing bytes, length overrun, unsupported version), the empty payload record, and `readRecordLength` ignoring trailing Payload bytes.
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 1.12_

  - [x] 1.8 Extend the purity script and tools tests
    - Extend `.kiro/hooks/scripts/purity.mjs` so `packages/codec/src` also bans `Math.log`, `Math.sqrt`, `Math.exp` and `Math.pow`. The other packages keep the original three bans.
    - Add tests under `tools/` for both behaviours.
    - Add a codec test that scans every file under `src` and reports zero banned symbols.
    - _Requirements: 6.2, 6.5, 6.6_

  - [x] 1.9 Group 1 checkpoint
    - Run `pnpm lint`, `pnpm typecheck` and `pnpm test` and report the outputs.
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 6.5, 9.4_

- [x] 2. Group 2: Generation (sparse and dense, parameterised, no golden vector JSON committed)
  - [x] 2.1 `soliton.ts`
    - Implement BigInt fixed point (F = 2^48) with `isqrt`, `lnQ` and the table build, parameterised by (c, delta) as rational numbers. The table is cached by K.
    - Put `SOLITON_C = 1/10` and `SOLITON_DELTA = 1/2` in `constants.ts` as provisional defaults, marked PROVISIONAL until Group 5.
    - Unit tests (the tests may use `Math.log`): `lnQ` matches `Math.log` within 2^-40.
    - Unit tests for the structural invariants: the table is monotone, `cumT[K] = 2^32`, K = 1 always gives degree 1, and the sizes are correct.
    - Do NOT commit golden vectors in this group.
    - _Requirements: 2.2, 6.2_

  - [x] 2.2 Dense constants in `constants.ts`
    - Add `DENSE_PERIOD` (D) with the PROVISIONAL value 4, where 0 means no Dense_Packets. Mark it PROVISIONAL until Group 5.
    - Add a derived helper `maxDenseRows(maxGaussianBlocks) = maxGaussianBlocks + 64`. It is derived, not a constant.
    - Unit tests: default D is 4, `maxDenseRows(1024) = 1088`, `maxDenseRows(0) = 64`.
    - _Requirements: 2.2, 5.19_

  - [x] 2.3 `neighbors.ts`: systematic and sparse Block sets
    - Implement `seed32`, degree sampling by binary search on `cumT`, partial Fisher-Yates with an undo log, and `seq < K` returning `{seq}` without using the PRNG. Take the soliton table as a parameter.
    - Unit tests for purity and determinism, distinct values, range [0, K), degree in [1, K], and systematic Packets.
    - Do NOT commit golden vectors in this group.
    - _Requirements: 2.3, 2.4, 6.2_

  - [x] 2.4 `neighbors.ts`: `isDense` and the dense Block set
    - Implement `isDense(seq, K, D) = D > 0 && seq >= K && ((seq - K) % D) == D - 1`, using plain integer arithmetic and no PRNG or session data.
    - Implement the dense Block set with no degree draw: PRNG seeded as for sparse, `nw = ceil(K / 32)` words taken as the (w+1)-th output, Block b included iff bit (b mod 32) of word floor(b / 32) is 1, high bits of the last word ignored, and an empty set replaced by `{seq mod K}`. Share the scratch buffers with the sparse path. Dispatch order: `seq < K` systematic, else dense if `isDense`, else sparse.
    - Unit tests for `isDense` against the index rule at examples, at seq just above K, at seq near 2^32 - 1 and after the wrap to K, for D in {0, 3, 4, 8}, and for D = 0 giving never dense.
    - Unit tests for the four dense reference-vector rows from design.md (0x12345678/53/K=50, 0x12345678/103/K=100, 0xDEADBEEF/7/K=1, 0xDEADBEEF/7/K=5), checking both the PRNG words and the Block sets. These rows test the dense algorithm itself, so they apply regardless of D.
    - Unit tests for the empty-set rule (a case found by search or a constructed word set via an injected word source) and for the high-bit-ignored rule at K not a multiple of 32.
    - Do NOT commit golden vector JSON in this group.
    - _Requirements: 2.2, 2.10, 2.11, 2.12, 6.2_

  - [x] 2.5 `xor.ts`, stride helpers and the dense XOR helper
    - Implement `xorInto` with `Uint32Array` views plus a byte tail, and stride helpers (`ceil(blockSize / 4) * 4`).
    - Implement the helper that XORs the Blocks of a given Block set into a destination, used for dense payloads (about K/2 Blocks) and sparse payloads alike.
    - Unit tests for unaligned blockSize values 16, 17, 18, 19 and 2923, compared against a naive byte XOR.
    - Unit tests that the set-XOR helper matches a naive byte XOR for a dense-sized set (about K/2 Blocks) and for a single-Block set.
    - _Requirements: 2.1, 2.3, 2.13_

  - [x] 2.6 Group 2 checkpoint
    - Run `pnpm lint`, `pnpm typecheck` and `pnpm test` and report the outputs.
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 6.5_

- [x] 3. Group 3: Encoder, decoder (including the dense path), hash and barrel (no golden vectors, no calibrated numbers)
  - [x] 3.1 `hash.ts`
    - Implement `HashFn` and `sha256WebCrypto` using `globalThis.crypto.subtle`.
    - Unit tests: a 32-byte digest, known SHA-256 vectors including empty input, and both a sync and an async `HashFn` accepted.
    - _Requirements: 1.9, 1.10_

  - [x] 3.2 `overhead.ts` and the provisional table
    - Implement `fLatePermille`, `fColdPermille`, `lateCount`, `coldLimit` and `R` with integer linear interpolation (ceil) and clamping outside [10, 2000]. Keep it internal, not in the barrel.
    - Commit `src/overhead-table.json` with `"provisional": true`, a `D` field (integer, 0 = none, provisional 4) alongside `c` and `delta`, and conservative placeholder values for K in {10, 25, 50, 100, 250, 500, 1000, 2000}. These values are never used for claims.
    - Unit tests for interpolation examples, clamping, the table K values, integer outputs, and that the table records c, delta and D (R10.7).
    - _Requirements: 10.1, 10.2, 10.3, 10.7_

  - [x] 3.3 `encoder.ts`
    - `encode()`: validate, hash, build the record, take the session id, build the strided buffer, check limits (PAYLOAD_TOO_LARGE, TOO_MANY_BLOCKS).
    - Packet payloads follow the dispatch rule: systematic copy for seq < K, XOR of the dense Block set for Dense_Packets, XOR of the sparse Block set otherwise.
    - `next()` is synchronous, goes 0..K-1 then K, K+1, ..., and wraps from 2^32 - 1 to K.
    - `page()` is synchronous, returns K + repairCount Packets (default `R(K)`), and validates a configured repairCount without changing state.
    - Unit tests: the packetSize option and bounds, limit boundaries (equal to the limit is accepted), the seq wrap, `page()` ordering and count, repairCount validation, determinism of the first 3K Packets, and the empty payload.
    - Unit tests for dense emission: the Packet kind at each seq matches the index rule (for D = 0, 3, 4, 8 via an internal override), a Dense_Packet payload equals the XOR of the Blocks in its dense set, two Encoders give byte-identical dense Packets, and the kind rule still holds after the seq wrap.
    - _Requirements: 1.2, 1.8, 2.1, 2.2, 2.3, 2.10, 2.13, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 6.7, 7.3, 7.4_

  - [x] 3.4 `decoder.ts` (a): state, push flow and session handling
    - Implement the state structures: params, `blocks`, `solved`, the equation slab, adjacency and the `seen` set.
    - Push flow for systematic and sparse Packets: `decodePacket` with limits, the first Packet fixes the session, SESSION_MISMATCH and DUPLICATE_PACKET are ignored, inconsistent params are rejected with BAD_HEADER, ALREADY_COMPLETE, and progress fields.
    - Dispatch point: after the duplicate check, a Packet with `seq >= K` and `isDense(seq, K, D)` is routed to the dense path (implemented in 3.6). Dense Packets are never inserted into adjacency or the ripple.
    - Memory bound for sparse equations: at most `2K + 64` stored. Packets beyond that are counted as distinct but their values are dropped.
    - Packet-level problems are returned in the status, never thrown, and leave state unchanged.
    - Unit tests for each status and for state unchanged on ignore and reject.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.17, 5.18, 7.7_

  - [x] 3.5 `decoder.ts` (b): peeling
    - Implement peeling with adjacency lists and a ripple queue.
    - Peeling-only completion does not run Gaussian elimination.
    - When peeling stalls and the residual exceeds `maxGaussianBlocks`, keep collecting Packets with no error and no `rejected` status.
    - Unit tests: peeling-only completion (a spy confirms no GE call), the over-cap residual, and solved-block bookkeeping.
    - _Requirements: 5.7, 5.15, 5.16, 2.6_

  - [x] 3.6 `decoder.ts` (c): dense store and dense path
    - Implement the dense store with `maxDenseRows = maxGaussianBlocks + 64` slots and a free list. Per slot: `denseBits` (K-bit row), `densePayload` (stride bytes) and `denseFolded` (K-bit row of solved columns already XORed into the payload).
    - Build the K-bit row directly from the PRNG words, with the empty-set rule. Store each accepted Dense_Packet as a row plus payload, count it as distinct and record its seq in `seen`.
    - When the store is full, return `ignored` with DENSE_STORE_FULL, leave state unchanged, do not count the Packet in `distinctPackets` and do not record its seq as seen.
    - Sparse and systematic Packets keep peeling while the store is full.
    - Implement lazy folding: for each stored row and each newly solved column with its bit set in `denseBits` and not in `denseFolded`, XOR the Block into the row payload and set the folded bit, so no Block is XORed twice. A row with every column solved is discarded and its slot freed.
    - Dense rows never touch adjacency lists or the ripple.
    - Unit tests: dense row stored and counted (R5.18); the store never exceeds `maxDenseRows` (R5.19); DENSE_STORE_FULL ignore leaves state deep-equal, is not distinct and not seen, and the same Packet is accepted after a row is freed (R5.20, R5.22); sparse and systematic Packets still peel when the store is full (R5.21); a row with all columns solved is freed (R5.22); folding XORs each Block at most once; the folded payload equals a naive recomputation.
    - _Requirements: 5.18, 5.19, 5.20, 5.21, 5.22, 2.11, 2.12_

  - [x] 3.7 `gauss.ts` and completion
    - `gauss.ts`: GF(2) elimination on bitset rows. Phase A finds rank on a copy, building rows from stored sparse equations (degree >= 2) and from the folded dense rows, restricted to unsolved columns. Phase B solves at full rank. The retry backoff is `max(1, U - r)` further equations. Default `maxGaussianBlocks` is 1024, configurable.
    - Trigger: ripple empty, unsolved U > 0, U <= `maxGaussianBlocks`, (stored sparse equations + stored dense rows) >= U, and the backoff satisfied. Run lazy dense folding at the start of each attempt.
    - Completion: assemble the Coded_Stream, `readRecordLength`, `parseMetadata`, `await hash`, then compare hash and length.
    - On a match set `complete`. On a mismatch enter the terminal HASH_MISMATCH state with the bytes withheld, whichever Packet kinds contributed.
    - `result()` throws INCOMPLETE_DECODE before completion.
    - Serialize overlapping `push` calls with an internal promise chain.
    - Unit tests: GE trigger counting sparse plus dense, completion from systematic plus dense Packets only, rank-deficient retry, cap 0 and cap 1024 behaviour, HASH_MISMATCH with an injected wrong-digest HashFn, `result()` before completion, and concurrent pushes.
    - _Requirements: 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.18, 5.23, 1.12_

  - [x] 3.8 `index.ts` barrel
    - Export exactly the nine runtime symbols and the thirteen type-only exports listed in design.md.
    - Unit test that asserts the runtime export list and the type export list (R9.1).
    - _Requirements: 9.1, 9.6_

  - [x] 3.9 End-to-end unit tests
    - Round trip with all systematic Packets, drop and duplicate Packets, a foreign session, a corrupted Packet, the empty payload, K = 1, and tiny blockSize (packetSize 46).
    - Round trip with a mix of systematic, sparse and dense Packets (including a stream where some systematic Packets are dropped and recovery depends on dense rows), and a dense-only repair set with all systematic Packets present.
    - _Requirements: 1.8, 2.5, 2.6, 5.3, 5.4, 5.10, 5.12, 5.23, 7.7_

  - [x] 3.10 Group 3 checkpoint
    - Run `pnpm lint`, `pnpm typecheck` and `pnpm test` and report the outputs.
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 6.5, 9.4_

- [ ] 4. Group 4: Calibration tooling and (c, delta, D) sweep
  - [x] 4.1 `perf/calibrate.ts`
    - Seeded through `prng.ts`, using the real encoder and decoder with `sha256WebCrypto`. Payload bytes vary per trial. `packetSize` 62 (blockSize 32).
    - Simulate M1 (repair-only shuffle of seq K..5K-1, 4K cap), M2 (loss `next() < 1288490189`, 20K cap) and M3 (loss `next() < 214748365`).
    - Take the 0.995 quantile, round factors up to permille, and floor R at 0.
    - If any quantile is Infinity, exit non-zero, print the failing K and write nothing.
    - Print the table with a Wilson lower bound per cell.
    - Write the JSON only with `--write`, recording c, delta and D. Accept `--c`, `--delta`, `--D` (integer, 0 = none), `--K` as a list and `--samples`.
    - _Requirements: 10.4, 10.7, 2.7, 2.8, 4.7_

  - [x] 4.2 Calibration determinism test
    - Unit test that two runs with identical arguments (small K list, sample count and D) produce identical output.
    - Unit test that the written JSON records the c, delta and D passed on the command line.
    - _Requirements: 10.4, 10.7_

  - [x] 4.3 `perf/dense-cost.ts`
    - Measure the cost of one Dense_Packet from `next()` at K = 359 (1 MiB input, default packetSize): 3 discarded warm-ups, 20 timed runs, `process.hrtime.bigint`, report the median, p95, Node version and CPU model.
    - Measure and report the per-Dense_Packet cost at K = 11,500 (32 MiB payload) as informational output with no assertion.
    - Export the measurement functions so the sweep can call them.
    - _Requirements: 8.7_

  - [ ] 4.4 `perf/sweep.ts`
    - Run (c, delta) in {(0.1, 0.5), (0.03, 0.5)} x D in {none, 8, 4, 3}, 8 combinations, on the real implementation for K in {50, 100, 500}.
    - Print per combination f_late, f_cold and R (loss 0.05) for each K, plus the dense `next()` cost at K = 359 (median of 20 after 3 warm-ups) and at K = 11,500 (informational), using `dense-cost.ts`.
    - State the trial counts in the output: N = 1000 for K = 50 and 100, N = 500 for K = 500.
    - Print a recommendation: lowest summed f_cold over the three K, tie-break lowest summed f_late, then lowest dense cost at K = 359. Print the recommended (c, delta, D).
    - Write results only to the git-ignored `perf/out/` directory. Add it to `.gitignore`.
    - _Requirements: 2.2, 2.7, 2.8, 4.7, 8.7, 10.4, 10.7_

  - [ ] 4.5 Run the sweep and capture the table
    - Run the sweep, save the full output under `perf/out/`, and keep the table for the report.
    - Run `pnpm lint`, `pnpm typecheck` and `pnpm test` and report the outputs.
    - Do not freeze c, delta or D, do not generate `overhead-table.json`, do not commit golden vectors.
    - _Requirements: 2.2, 2.7, 2.8, 8.7_

  - [ ] 4.6 STOP CHECKPOINT: report the c/delta sweep and wait for approval
    - Report the full sweep table (f_late, f_cold and R at K = 50, 100, 500 for each of the 8 (c, delta, D) combinations), the measured dense `next()` cost at K = 359 against the 20 ms budget and at K = 11,500, and the recommended (c, delta, D). Flag any combination or claim that looks unreachable.
    - The user may instead choose to change the code design at this checkpoint (see design Risk 1).
    - Then STOP and wait for the user's approval. Do not freeze c, delta or D, do not generate `overhead-table.json`, do not commit golden vectors, and do not start Group 5 until the user answers.
    - _Requirements: 2.2, 2.9, 8.7, 10.7_

- [ ] 5. Group 5: Freeze, calibrate, golden vectors and all properties (only after approval)
  - [ ] 5.1 Freeze the approved c, delta and D
    - Set the approved values in `constants.ts` (`SOLITON_C`, `SOLITON_DELTA`, `DENSE_PERIOD`) and remove the PROVISIONAL marking from all three.
    - Unit test that the constants equal the approved values.
    - _Requirements: 2.2, 10.7_

  - [ ] 5.2 Calibrate and commit `overhead-table.json`
    - Run `calibrate --write` with the frozen c, delta and D for K in {10, 25, 50, 100, 250, 500, 1000, 2000} with the committed seeds. Commit the table without the `provisional` flag, recording c, delta and D.
    - Add the unit test that a fresh calibration for K in {10, 25, 50} (with the table's N_cal and D) equals the committed rows.
    - Add a unit test that the table's recorded c, delta and D equal the frozen constants.
    - _Requirements: 10.2, 10.4, 10.5, 10.7_

  - [ ] 5.3 Golden vectors from an independent reference
    - Write a standalone Python 3 generator under `packages/codec/test/golden/reference/`, from design.md only. It uses `hashlib` SHA-256, `zlib` CRC-32, and its own SplitMix32, xoshiro128**, integer fixed-point soliton, and its own implementation of the dense rule (index rule, word/bit order, empty-set rule).
    - It outputs `vectors.json` with a fixed payload, name, MIME and options, sessionId, K, D, the hex of the first Packets (covering systematic, sparse and dense Packets), neighbor sets for several seq including dense ones, PRNG vectors and CRC vectors.
    - The four dense reference-vector rows from design.md must also be reproduced by the Python generator and match.
    - Compare with the TypeScript implementation. If they differ, STOP and report, and do not adjust either side to match.
    - Commit `vectors.json` and the golden test that fails on any count or byte difference.
    - _Requirements: 2.10, 2.11, 2.12, 2.13, 6.3, 6.4, 6.7_

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

  - [ ] 5.19 P14: dense-or-sparse rule
    - **Property 14** (design P14). numRuns 1000. K in 1..20000, seq biased to include seq >= 2^32 - 50 and the wrap, D in {0, 3, 4, 8}. The kind of seq equals the index rule: systematic if seq < K, dense iff D > 0 and (seq - K) mod D == D - 1, else sparse.
    - Tag: `Feature: codec, Property 14: packet kind follows the index rule`.
    - **Validates: Requirements 2.2, 2.10**
    - _Requirements: 2.2, 2.10_

  - [ ] 5.20 P15: hash-gated dense safety
    - **Property 15** (design P15). numRuns 200. Decoder fed only dense and systematic Packets (random subsets, some dense payloads corrupted with a recomputed valid CRC), blockSize 32. The Decoder either never completes or completes with bytes equal to the original, and never exposes bytes when the hash fails.
    - Tag: `Feature: codec, Property 15: dense and systematic input never yields wrong bytes`.
    - **Validates: Requirements 5.18, 5.19, 5.20, 5.21, 5.22, 5.23, 5.10, 5.11**
    - _Requirements: 5.18, 5.19, 5.20, 5.21, 5.22, 5.23, 5.10, 5.11_

  - [ ] 5.21 P16: dense determinism
    - **Property 16** (design P16). numRuns 200. Same generators as P1. Two independent encodes give byte-identical dense Packets, and the dense Block set equals a reference algorithm re-implemented inside the test from the word/bit rule (including the empty-set rule).
    - Tag: `Feature: codec, Property 16: dense Packets are deterministic and match the reference rule`.
    - **Validates: Requirements 6.7, 2.11, 2.12, 2.13**
    - _Requirements: 6.7, 2.11, 2.12, 2.13_

  - [ ] 5.22 M1: late join
    - **Property M1** (design M1). N = 1000 trials per K in {50, 100, 500}, fixed fast-check seed distinct from the calibration seed, payload varied per trial, blockSize 32, frozen D.
    - Pool is repair seq K..5K-1. Assert at the table value: subset size `ceil(f_late x K)` completes in >= 0.99 of trials. Report f_late, the observed rate and the Wilson lower bound per K.
    - Tag: `Feature: codec, Property M1: late-join repair-only subsets complete`.
    - If any observed rate is below 0.99, STOP and report per R2.9. Never loosen the bound, never hand-edit the table, never recalibrate silently.
    - **Validates: Requirements 2.7, 2.9, 10.6, 10.7**
    - _Requirements: 2.7, 2.9, 10.6, 10.7_

  - [ ] 5.23 M2: cold start with 30% loss
    - **Property M2** (design M2). Same N, K values, seed policy and frozen D as M1.
    - Stream from seq 0 with loss 0.30. Assert received count <= `ceil(f_cold x K)` in >= 0.99 of trials. Report f_cold, the observed rate and the Wilson lower bound per K.
    - Tag: `Feature: codec, Property M2: cold start with 30% loss completes within f_cold x K`.
    - If any observed rate is below 0.99, STOP and report per R2.9. Never loosen the bound, never hand-edit the table, never recalibrate silently.
    - **Validates: Requirements 2.8, 2.9, 10.6, 10.7**
    - _Requirements: 2.8, 2.9, 10.6, 10.7_

  - [ ] 5.24 M3: Page_Mode with 5% loss
    - **Property M3** (design M3). Same N, K values, seed policy and frozen D as M1.
    - The default `page()` of T = K + R(K) Packets with loss 0.05 completes in >= 0.99 of trials. Report R(K), the observed rate and the Wilson lower bound per K. Also report success at loss 0.02 and 0.10 as informational output with no assertion.
    - Tag: `Feature: codec, Property M3: default page completes under 5% loss`.
    - If any observed rate is below 0.99, STOP and report per R2.9. Never loosen the bound, never hand-edit the table, never recalibrate silently.
    - **Validates: Requirements 4.7, 2.9, 10.6, 10.7**
    - _Requirements: 4.7, 2.9, 10.6, 10.7_

  - [ ] 5.25 Full-suite checkpoint
    - Run `pnpm lint`, `pnpm typecheck` and `pnpm test` and report the outputs.
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 2.9, 6.4, 10.5_

  - [ ] 5.26 Runtime check of `test:measured`
    - Time `test:measured` and the default `pnpm test`. If the default `pnpm test` exceeds 60 s, stop and report the exception per the design.
    - _Requirements: 2.7, 2.8, 4.7_

- [ ] 6. Group 6: Perf, browser and docs
  - [ ] 6.1 Encode and decode perf under `packages/codec/perf`
    - Method: 3 discarded warm-ups, 20 timed runs, `process.hrtime.bigint`. Output the Node version, the CPU model and the p95 (the 19th sorted value), and use the same seed and input every run.
    - Encode a 1 MiB seeded input with median < 200 ms.
    - Decode fixture (a), the K systematic Packets, and fixture (b), `ceil(f_late x K)` seeded random repair Packets (which include dense Packets at the frozen D), each with median < 500 ms and output identical to the input in every run.
    - On a budget miss, fail and print the measured median and the budget. If fixture (b) exceeds its budget, STOP and report per R8.6.
    - Report encode and decode for a 32 MiB payload with no assertion.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ] 6.2 Dense Packet perf under `packages/codec/perf`
    - Dense `next()` at K = 359 (1 MiB input, default packetSize): 3 discarded warm-ups, 20 timed runs, median < 20 ms. On a miss, fail, print the measured median and the budget, and STOP and report to the user without changing the budget.
    - Report the per-Dense_Packet cost at K = 11,500 (32 MiB payload) with no assertion.
    - Report the lazy dense folding cost at K = 11,500 with U <= 1024 and a full dense store, with no assertion.
    - _Requirements: 8.4, 8.7_

  - [ ] 6.3 Playwright Chromium check
    - Create a tiny Vite-served harness page in `apps/strip/e2e-harness` that imports the codec through its barrel.
    - Add a test in `apps/strip/e2e` that compares Default_Hash parity with Node (including empty input) and golden-vector Packet bytes (systematic, sparse and dense) against `vectors.json`, plus a Payload round trip.
    - Document `pnpm exec playwright install chromium` as a step. If it prompts for anything or fails, STOP and report.
    - _Requirements: 1.11, 9.5_

  - [ ] 6.4 Dependency log consistency test
    - Add a test under `tools/` that every dependency in every `package.json` is exact-pinned and has a row in `docs/dependencies.md`, and that `packages/codec` has no `dependencies` key.
    - _Requirements: 9.6, 9.7_

  - [ ] 6.5 `packages/codec/README.md`
    - Cover usage of `encode` and `createDecoder`, a packet format summary, and the measured M1 to M3 table from `overhead-table.json` with N and Wilson bounds.
    - Document the dense repair rows: the index rule, the frozen D and (c, delta), the dense Block-set derivation, the `maxDenseRows` bound, the DENSE_STORE_FULL ignore reason and the dense `next()` cost measurements.
    - Include the no-fixed-overhead note and the non-goals.
    - _Requirements: 2.2, 2.7, 2.8, 4.7, 5.20, 8.7, 10.2, 10.7_

  - [ ] 6.6 Final verification
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:e2e`, and report the outputs.
    - Summarize the measured results (M1 to M3, perf medians including dense `next()`).
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 2.9, 6.5, 8.3, 8.7, 9.5_

## Notes

- No task is optional. Every property test is required.
- Group 5 starts only after the user approves at the Group 4 STOP CHECKPOINT (task 4.6). c, delta and D are frozen only in task 5.1.
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
    { "id": 13, "tasks": ["2.5"] },
    { "id": 14, "tasks": ["2.6"] },
    { "id": 15, "tasks": ["3.1"] },
    { "id": 16, "tasks": ["3.2"] },
    { "id": 17, "tasks": ["3.3"] },
    { "id": 18, "tasks": ["3.4"] },
    { "id": 19, "tasks": ["3.5"] },
    { "id": 20, "tasks": ["3.6"] },
    { "id": 21, "tasks": ["3.7"] },
    { "id": 22, "tasks": ["3.8"] },
    { "id": 23, "tasks": ["3.9"] },
    { "id": 24, "tasks": ["3.10"] },
    { "id": 25, "tasks": ["4.1"] },
    { "id": 26, "tasks": ["4.2"] },
    { "id": 27, "tasks": ["4.3"] },
    { "id": 28, "tasks": ["4.4"] },
    { "id": 29, "tasks": ["4.5"] },
    { "id": 30, "tasks": ["4.6"] },
    { "id": 31, "tasks": ["5.1"] },
    { "id": 32, "tasks": ["5.2"] },
    { "id": 33, "tasks": ["5.3"] },
    { "id": 34, "tasks": ["5.4"] },
    { "id": 35, "tasks": ["5.5"] },
    { "id": 36, "tasks": ["5.6"] },
    { "id": 37, "tasks": ["5.7"] },
    { "id": 38, "tasks": ["5.8"] },
    { "id": 39, "tasks": ["5.9"] },
    { "id": 40, "tasks": ["5.10"] },
    { "id": 41, "tasks": ["5.11"] },
    { "id": 42, "tasks": ["5.12"] },
    { "id": 43, "tasks": ["5.13"] },
    { "id": 44, "tasks": ["5.14"] },
    { "id": 45, "tasks": ["5.15"] },
    { "id": 46, "tasks": ["5.16"] },
    { "id": 47, "tasks": ["5.17"] },
    { "id": 48, "tasks": ["5.18"] },
    { "id": 49, "tasks": ["5.19"] },
    { "id": 50, "tasks": ["5.20"] },
    { "id": 51, "tasks": ["5.21"] },
    { "id": 52, "tasks": ["5.22"] },
    { "id": 53, "tasks": ["5.23"] },
    { "id": 54, "tasks": ["5.24"] },
    { "id": 55, "tasks": ["5.25"] },
    { "id": 56, "tasks": ["5.26"] },
    { "id": 57, "tasks": ["6.1"] },
    { "id": 58, "tasks": ["6.2"] },
    { "id": 59, "tasks": ["6.3"] },
    { "id": 60, "tasks": ["6.4"] },
    { "id": 61, "tasks": ["6.5"] },
    { "id": 62, "tasks": ["6.6"] }
  ]
}
```
