# @strip/codec

Pure TypeScript fountain codec for Strip. It turns a file into a stream of fixed-size packets and rebuilds the file from enough distinct packets, received in any order, with losses and duplicates. Zero runtime dependencies, no DOM, no network, no `Math.random`, `Date.now` or `performance.now`; it runs unchanged in Node and in browsers.

## Usage

```ts
import { createDecoder, encode } from "@strip/codec";

// Sender: the default packet size is 2953 bytes (QR version 40, byte mode, level L).
const encoder = await encode({ bytes, name: "report.pdf", mime: "application/pdf" });
const next = encoder.next();        // endless stream: systematic packets first, then repair packets
const page = encoder.page();        // finite set for paper: K systematic + R(K) repair packets

// Receiver: push packets in any order.
const decoder = createDecoder();
const status = await decoder.push(packetBytes);
// status.kind: "accepted" | "ignored" (reason) | "rejected" (ErrorCode); status.progress has
// solvedBlocks, totalBlocks, distinctPackets, complete.
if (decoder.progress().complete) {
  const { payload, metadata } = decoder.result(); // verified: SHA-256 and length match the record
}
```

`encode` and `push` are async because SHA-256 comes from an injectable hash function (default: Web Crypto). Everything else is synchronous. The public surface is the barrel `src/index.ts`: `encode`, `createDecoder`, `serializeMetadata`, `parseMetadata`, `encodePacket`, `decodePacket`, `CodecError`, `ERROR_CODES`, `sha256WebCrypto`, plus types.

Failures are `CodecError` with a code from a closed set: `INVALID_INPUT`, `PAYLOAD_TOO_LARGE`, `TOO_MANY_BLOCKS`, `BAD_METADATA`, `BAD_HEADER`, `UNSUPPORTED_VERSION`, `BAD_CRC`, `SESSION_MISMATCH`, `INCOMPLETE_DECODE`, `HASH_MISMATCH`. Packet-level problems in `push` are returned in the status and leave the decoder unchanged. `HASH_MISMATCH` (and `BAD_METADATA` after full recovery) is a decoder-level verdict: `rejected`, terminal, state already changed. CRC detects corruption, not forgery.

The size limit `maxPayloadBytes` (default 32 MiB) applies to the coded stream: the metadata record plus the payload.

## Packet format (version 1)

Big-endian, 26-byte header, XOR payload, 4-byte trailing CRC-32.

| Offset | Field | Type |
|---|---|---|
| 0 | magic 0x5354 | u16 |
| 2 | version = 1 | u8 |
| 3 | flags = 0 | u8 |
| 4 | session id (first 4 bytes of SHA-256 of the metadata record) | u32 |
| 8 | coded stream length L | u32 |
| 12 | block size | u16 |
| 14 | block count K | u32 |
| 18 | sequence number | u32 |
| 22 | header CRC-32 (bytes 0..21) | u32 |
| 26 | XOR payload | block size bytes |
| 26 + block size | CRC-32 of everything before it | u32 |

The coded stream is the metadata record (version, name, MIME type, byte length, SHA-256) followed by the file bytes, cut into K blocks. Sequence numbers 0..K-1 are systematic packets (the block itself). Higher numbers are repair packets whose block set comes only from the session id and the sequence number, through xoshiro128** seeded by SplitMix32. Everything that shapes a packet is integer-only. The golden vectors in `test/golden/vectors.json` come from an independent Python reference (`test/golden/reference/generate.py`); the TypeScript encoder reproduces them byte for byte, and so does Chromium.

## Dense repair rows

Repair packets are of two kinds, decided by index alone. With `j = seq - K`, a packet is **dense** iff `j mod D == D - 1`, otherwise **sparse** (robust soliton degree, partial Fisher-Yates selection). The frozen constants are `(c, delta) = (1/10, 1/2)` and `D = 3`, so every third repair packet is dense. Changing any of them changes the sampled packets: regenerate the golden vectors and the overhead table, and bump the format version after a release.

A dense packet's block set has no degree draw: word `w` is the `(w+1)`-th PRNG output, block `b` is included iff bit `b mod 32` of word `floor(b / 32)` is 1, so each block is included with probability 1/2. An empty set becomes `{seq mod K}`. The decoder never puts dense rows in the peeling structures. It stores each as a K-bit row plus payload, folds solved blocks into the payload lazily, and uses them only in Gaussian elimination. At most `maxDenseRows = maxGaussianBlocks + 64` rows are stored. When the store is full a dense packet is ignored with `DENSE_STORE_FULL` (not counted, not recorded as seen, so a retransmission can be accepted after rows free up); sparse and systematic packets keep peeling.

Dense `next()` cost, median of 20 runs after 3 warm-ups (Apple M2 Pro, Node v25.9.0): 0.101 ms at K = 359 (1 MiB, budget 20 ms); 2.96 ms at K = 11,480 (32 MiB, informational). Lazy folding of a full store of 1088 rows at K = 11,480 took 3.1 s once (one run, informational); the elimination push that followed took 345 ms.

## Measured overhead (not guarantees)

There is no fixed overhead claim. No code, including an ideal dense random linear code, reaches 0.99 success below roughly `K + 7` received packets, so a single ratio cannot hold at small K. Success is stated as three measured claims per K, with the factors calibrated into `src/overhead-table.json` by `perf/calibrate.ts` (seeded, deterministic):

- **M1 late join:** a uniformly random subset of repair packets only (sequence numbers K..5K-1) of size `ceil(f_late x K)` completes.
- **M2 cold start with loss:** the stream from sequence 0, each packet lost with probability 0.30, completes within `ceil(f_cold x K)` received packets.
- **M3 page mode:** the default `page()` of `K + R(K)` packets, each lost with probability 0.05, completes.

Each row records its own number of trials N and table quantile: 0.999 where N >= 1000 (K <= 500), 0.995 where N <= 300 (a higher quantile from so few trials would just be the sample maximum). Values are interpolated linearly in K and clamped only outside K = 10..16384.

| K | N | quantile | f_late (permille) | f_cold (permille) | R |
|---|---|---|---|---|---|
| 10 | 3000 | 0.999 | 2300 | 2300 | 14 |
| 25 | 3000 | 0.999 | 1480 | 1840 | 24 |
| 50 | 3000 | 0.999 | 1220 | 1480 | 31 |
| 100 | 3000 | 0.999 | 1110 | 1310 | 36 |
| 250 | 1000 | 0.999 | 1040 | 1188 | 60 |
| 500 | 1000 | 0.999 | 1018 | 1154 | 93 |
| 1000 | 300 | 0.995 | 1008 | 1126 | 144 |
| 2000 | 300 | 0.995 | 1820 | 1113 | 257 |
| 4000 | 100 | 0.995 | 1759 | 1115 | 489 |
| 8000 | 100 | 0.995 | 1690 | 1405 | 975 |
| 16384 | 100 | 0.995 | 1661 | 1618 | 1932 |

Fresh-seed verification (`pnpm --filter @strip/codec test:measured`, N = 1000 trials per cell, fixed fast-check seeds that differ from the calibration seed, asserted at 0.99):

| Claim | K | successes / 1000 | rate | Wilson 95% lower bound |
|---|---|---|---|---|
| M1 | 50 | 1000 | 1.0000 | 0.9962 |
| M1 | 100 | 998 | 0.9980 | 0.9927 |
| M1 | 500 | 1000 | 1.0000 | 0.9962 |
| M2 | 50 | 990 | 0.9900 | 0.9817 |
| M2 | 100 | 1000 | 1.0000 | 0.9962 |
| M2 | 500 | 998 | 0.9980 | 0.9927 |
| M3 | 50 | 1000 | 1.0000 | 0.9962 |
| M3 | 100 | 998 | 0.9980 | 0.9927 |
| M3 | 500 | 1000 | 1.0000 | 0.9962 |

These are measurements with a stated sample size: evidence, not proof. M2 at K = 50 sits exactly on the 0.99 line. A page sized for 5% loss does not survive much more: at 10% loss the success rate was 0.991 (K = 50), 0.979 (K = 100) and 0.337 (K = 500).

## Large files

Above about K = 1000 (roughly 2.9 MB at the default 2923-byte block), a late join needs noticeably more packets, because the Gaussian elimination cap (`maxGaussianBlocks`, default 1024) stops the decoder from eliminating while more than 1024 blocks are unsolved. It keeps collecting packets, never errors, and finishes once peeling brings the residual under the cap. Measured: at K = 1250 to 2000 a repair-only late join took a median of about 1.6x to 1.7x the packets with the default cap, against about 1.00x with the cap raised to 4096 (20 trials per cell, 32-byte blocks). The table rows from K = 2000 up (f_late 1820 to 1661 permille) include this effect.

The cap is configurable through `createDecoder({ maxGaussianBlocks })`. Raising it trades packets for Gaussian cost: the value work is about `U^2 / 2` row XORs of the block size (U = unsolved blocks), which is seconds on a phone at the real 2923-byte block. One measured data point at the real block size (K = 1500, repair-only late join, one run, informational, includes SHA-256): with `maxGaussianBlocks = 2048` the decode took 456 ms from 1501 packets; with the default 1024 it took 62 ms of compute but needed 2805 packets (1.87x). Real files are expected to be small, so the default stays 1024.

## Performance (formal, median of 20 runs after 3 warm-ups, `process.hrtime.bigint`)

Apple M2 Pro, Node v25.9.0, seeded 1 MiB input (K = 359), default packet size. Budgets from R8 are asserted by `pnpm --filter @strip/codec perf:codec` and `perf:dense`.

| Measurement | median | p95 | budget |
|---|---|---|---|
| encode 1 MiB into its K systematic packets (SHA-256, framing, CRC) | 3.9 ms | 4.9 ms | < 200 ms |
| decode (a): the K systematic packets (peeling, SHA-256 check) | 11.1 ms | 11.8 ms | < 500 ms |
| decode (b): 371 seeded random repair packets (peeling, elimination, SHA-256 check) | 33.2 ms | 33.7 ms | < 500 ms |
| dense `next()` | 0.101 ms | 0.126 ms | < 20 ms |

32 MiB (K = 11,480, one run each, no budget): encode plus K systematic packets 140 ms; decode (a) 124 ms; decode of 19,264 repair packets in stream order 408 ms.

## Non-goals

QR encoding and decoding, camera capture, printing, UI, compression, encryption, multi-file bundles, and authentication of packets (the CRC detects corruption, not tampering). Those belong to other packages or later versions.

## Development

```
pnpm --filter @strip/codec test            # unit and property tests (about 10 s with the other packages)
pnpm --filter @strip/codec test:measured   # M1 to M3 at the table values (about 17 s)
pnpm --filter @strip/codec perf:codec      # formal encode and decode measurements
pnpm --filter @strip/codec perf:dense      # dense packet measurements
pnpm --filter @strip/codec perf:sweep      # (c, delta, D) sweep
pnpm --filter @strip/app test:e2e          # Chromium golden and hash parity (first: pnpm exec playwright install chromium)
python3 packages/codec/test/golden/reference/generate.py   # regenerate golden vectors (only on a deliberate format change)
CAL_ARGS="--c 1/10 --delta 1/2 --D 3 --K 10,25,50,100,250,500 --samples 10:3000,25:3000,50:3000,100:3000,250:1000,500:1000 --quantile 0.999 --merge --write" pnpm --filter @strip/codec perf:calibrate
```
