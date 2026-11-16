# Requirements Document

## Introduction

Strip is a client-side PWA that turns any file into a printable strip or an animated on-screen code sequence that a phone camera reads back. This spec covers only `packages/codec` (`@strip/codec`). The Codec is pure TypeScript that runs in Node and in browsers, uses no DOM and no network, and uses no `Math.random`, `Date.now` or `performance.now` anywhere in `src` (ESLint-enforced).

The Codec turns a Payload (bytes plus metadata) into a stream of fixed-size Packets using an LT fountain code, and rebuilds the Payload from any sufficient set of distinct Packets received in any order. Each acceptance criterion ends with a verification tag in square brackets: `[unit]`, `[property]`, `[Playwright]` or `[manual]`.

Measured numeric bounds in this document are stated as measurements with a sample size and method. They are evidence, not guarantees.

## Glossary

- **Codec**: The `@strip/codec` package as a whole.
- **Payload**: The bytes of one file together with its Metadata.
- **Metadata**: The tuple {file name, MIME type, byte length, SHA-256 of the Payload bytes}.
- **Metadata_Record**: The serialized binary form of Metadata, produced by the Metadata_Serializer.
- **Metadata_Serializer**: The Codec component that implements `serializeMetadata` and `parseMetadata`.
- **Coded_Stream**: The byte string Metadata_Record || Payload bytes. Its length is L.
- **Block**: One fixed-size slice of the Coded_Stream. The last Block is zero-padded to block size.
- **K**: The number of Blocks, equal to ceil(L / blockSize).
- **Packet**: One serialized unit: header (26 bytes), XOR payload (blockSize bytes), trailing CRC-32 (4 bytes).
- **Packet_Codec**: The Codec component that implements `encodePacket` and `decodePacket`.
- **Systematic_Packet**: A Packet with sequence number 0..K-1, whose XOR payload is the Block with that index unchanged.
- **Repair_Packet**: A Packet with sequence number >= K, whose Block set is derived from (session id, sequence number) by the PRNG.
- **Session_Id**: The first 4 bytes of the SHA-256 of the Metadata_Record.
- **Encoder**: The object returned by `encode()`, exposing `next()` and `page()`.
- **Decoder**: The object returned by `createDecoder()`, exposing `push()` and a result accessor.
- **PRNG**: The named, integer-only, seeded pseudo-random generator used for degree and Block selection.
- **Hash_Function**: A function of type `(data: Uint8Array) => Uint8Array | Promise<Uint8Array>` that returns a SHA-256 digest.
- **Default_Hash**: The exported Hash_Function based on `globalThis.crypto.subtle`.
- **Stream_Mode**: Emission of an unbounded deterministic Packet sequence.
- **Page_Mode**: Emission of a finite Packet set for paper.
- **repairCount**: The number of Repair_Packets in a Page_Mode set.
- **packetSize**: Total bytes of one Packet. Default 2953, the byte-mode capacity of QR version 40 at error correction level L.
- **blockSize**: packetSize - 26 - 4. Default 2923.
- **maxPayloadBytes**: Maximum Payload size parameter. Default 32 MiB.
- **maxBlockCount**: Maximum K parameter. Default 16384.
- **maxGaussianBlocks**: Maximum number of unsolved Blocks for which the Decoder runs Gaussian elimination. Default 256.
- **ErrorCode**: The closed union INVALID_INPUT, PAYLOAD_TOO_LARGE, TOO_MANY_BLOCKS, BAD_METADATA, BAD_HEADER, UNSUPPORTED_VERSION, BAD_CRC, SESSION_MISMATCH, INCOMPLETE_DECODE, HASH_MISMATCH.
- **Ignore_Reason**: The closed union DUPLICATE_PACKET, SESSION_MISMATCH, reported when the Decoder ignores a Packet without error.
- **CodecError**: The error type carrying `{ code, message }`.
- **Barrel**: `packages/codec/src/index.ts`, the only public entry point.
- **Wilson_Lower_Bound**: The lower end of the Wilson 95% confidence interval for an observed success proportion.

## Requirements

### Requirement 1: Payload model and metadata

**User Story:** As a sender, I want the file name, type, length and hash carried with the bytes, so that the receiver can restore and verify the file.

#### Acceptance Criteria

1. THE Metadata_Serializer SHALL serialize Metadata into a Metadata_Record with fields in this order: record version (1 byte), name length (u16) and UTF-8 name, MIME length (u8) and ASCII MIME type, byte length (u32), SHA-256 (32 bytes), with all multi-byte integers encoded big-endian and no padding between fields. [unit]
2. THE Codec SHALL build the Coded_Stream as the Metadata_Record followed by the Payload bytes, with no bytes between them, so that the Coded_Stream length equals the Metadata_Record length plus the Payload length. [unit]
3. FOR ALL valid Metadata, THE Metadata_Serializer SHALL produce a value from `parseMetadata(serializeMetadata(m))` equal to `m`, where equality compares name, MIME type, byte length and all 32 SHA-256 bytes. [property]
4. IF a file name is empty, longer than 255 UTF-8 bytes, contains `/`, `\`, NUL or a control character (U+0000 to U+001F or U+007F), or equals `.` or `..`, THEN THE Metadata_Serializer SHALL reject it with BAD_METADATA and SHALL NOT produce a Metadata_Record. [property]
5. IF a MIME type is longer than 127 bytes or contains a non-ASCII byte (a byte above 0x7F), THEN THE Metadata_Serializer SHALL reject it with BAD_METADATA and SHALL NOT produce a Metadata_Record. [unit]
6. IF the Metadata_Record is truncated, has trailing bytes, or has a length field that exceeds the remaining bytes, THEN THE Metadata_Serializer SHALL reject it with BAD_METADATA and SHALL NOT return partial Metadata. [property]
7. IF the record version byte is not a supported version, THEN THE Metadata_Serializer SHALL reject the record with UNSUPPORTED_VERSION and SHALL NOT return partial Metadata. [unit]
8. WHEN a Payload of 0 bytes is encoded, THE Encoder SHALL accept it as a valid Payload and SHALL produce a Coded_Stream consisting of the Metadata_Record with a byte length of 0. [unit]
9. THE Codec SHALL obtain SHA-256 digests through an injectable Hash_Function and SHALL await its result, so that a Hash_Function returning a Promise and one returning a value directly both produce a 32-byte digest in the Metadata_Record. [unit]
10. THE Codec SHALL export Default_Hash, which computes SHA-256 using `globalThis.crypto.subtle` and returns a 32-byte digest. [unit]
11. WHEN the Default_Hash is run in bundled Chromium, THE Default_Hash SHALL return the same digest as it returns in Node for the same input, compared byte for byte, including for the empty (0-byte) input. [Playwright]
12. WHEN the Decoder splits a recovered Coded_Stream, THE Decoder SHALL determine the Metadata_Record length from the record's own length fields and SHALL pass exactly those bytes to `parseMetadata`, so that `parseMetadata` never sees Payload bytes as trailing bytes. [unit]

### Requirement 2: Fountain coding

**User Story:** As a receiver, I want to start scanning at any point and tolerate missed frames, so that I can recover the file without a fixed order.

#### Acceptance Criteria

1. THE Codec SHALL split the Coded_Stream into K = ceil(L / blockSize) Blocks, where L is the Coded_Stream length in bytes and blockSize is the positive integer block size carried in every Packet header, zero-padding the last Block to blockSize bytes, and SHALL carry L in every Packet header. [unit]
2. THE Codec SHALL use an LT code whose degree distribution is the robust soliton distribution with constants (c, delta) fixed per format version and absent from the header. [unit]
3. THE Encoder SHALL emit the Block with index i unchanged as the XOR payload of the Systematic_Packet with sequence number i, for every integer i in 0..K-1. [property]
4. THE Encoder SHALL derive the Block set of a Repair_Packet solely from its Session_Id and sequence number through the PRNG, so that two Encoders given the same Session_Id and sequence number produce an identical Block set. [property]
5. WHEN all K Systematic_Packets are pushed in any order, THE Decoder SHALL recover the Coded_Stream with every byte identical to the original, excluding the zero-padding of the last Block. [property]
6. WHEN Packets are dropped or duplicated, THE Decoder SHALL complete once enough distinct Packets have arrived, ignoring a duplicate Packet without changing decoder state, and SHALL recover the Coded_Stream with every byte identical to the original, excluding the zero-padding of the last Block. [property]
7. WHEN a random set of about 1.1 x K distinct Packets is pushed, THE Decoder SHALL complete with an observed success rate of at least 0.99 for K >= 50. The set size is ceil(1.1 x K) distinct Packets. The measurement uses N = 1000 trials for each K in {50, 100, 500}. Each trial is seeded deterministically through fast-check seeds. The pool is sequence numbers drawn uniformly without replacement from [0, 3K), mixing Systematic_Packets and Repair_Packets. A trial succeeds if and only if the Decoder completes and recovers the Coded_Stream with every byte identical to the original, excluding the zero-padding of the last Block. The observed success rate is the number of successful trials divided by N. The test output reports the observed rate and the Wilson_Lower_Bound. [property]
8. THE test suite SHALL report the observed success rate for a repair-only pool (sequence numbers >= K) as informational output with no assertion, using the same K values, N and seeding as criterion 7. [property]
9. IF the observed success rate in criterion 7 is below 0.99 for any K, THEN THE test suite SHALL fail and the author SHALL stop and report to the user (see Open question 4) without loosening the bound. [manual]

### Requirement 3: Packet format

**User Story:** As a receiver, I want each Packet to be self-describing and checked, so that corrupted scans are rejected.

#### Acceptance Criteria

1. THE Packet_Codec SHALL write the header (26 bytes in total) big-endian in this order: magic (2 bytes, 0x53 0x54), version (1 byte, value 1), reserved flags (1 byte, value 0), Session_Id (4 bytes), L (u32), blockSize (u16), K (u32), sequence number (u32), header CRC-32 (4 bytes) computed over the preceding 22 header bytes. [unit]
2. THE Packet_Codec SHALL follow the header with the XOR payload of blockSize bytes and a trailing CRC-32 (4 bytes, big-endian) computed over all preceding bytes of the Packet (the 26 header bytes and the blockSize payload bytes). [unit]
3. THE Codec SHALL derive the Session_Id as the first 4 bytes of the SHA-256 of the Metadata_Record. [unit]
4. THE Encoder SHALL accept a packetSize option, SHALL default it to 2953, and SHALL set blockSize to packetSize - 26 - 4, giving 2923 at the default. [unit]
5. IF packetSize yields a blockSize below 16 or above 65535 (that is, packetSize below 46 or above 65565), THEN THE Encoder SHALL reject the option with INVALID_INPUT and SHALL produce no Packets. [unit]
6. WHEN decoding a Packet, THE Packet_Codec SHALL verify the header CRC-32 over the first 22 header bytes before trusting or acting on any other header field. [unit]
7. IF the header CRC-32 does not match, THEN THE Packet_Codec SHALL reject the Packet with BAD_CRC, regardless of any other defect in the Packet. [unit]
8. IF the header CRC-32 matches and the trailing CRC-32 does not match, THEN THE Packet_Codec SHALL reject the Packet with BAD_CRC. [unit]
9. FOR ALL valid Packets, flipping any single bit at any position (header, payload, or either CRC-32) SHALL cause `decodePacket` to reject the Packet with an error. [property]
10. IF the header CRC-32 matches and the magic bytes are wrong, the flags byte is not 0, or the Packet length differs from 26 + blockSize + 4, or the Packet is shorter than 26 bytes, THEN THE Packet_Codec SHALL reject the Packet with BAD_HEADER. [unit]
11. IF the header CRC-32 matches, the magic bytes are correct, and the version byte is not 1, THEN THE Packet_Codec SHALL reject the Packet with UNSUPPORTED_VERSION. [unit]
12. WHEN decoding a Packet whose header CRC-32 matches, THE Packet_Codec SHALL check L against maxPayloadBytes, K against maxBlockCount, and K == ceil(L / blockSize), in that order, before allocating any buffer sized from header fields. [unit]
13. IF L exceeds maxPayloadBytes, THEN THE Packet_Codec SHALL reject the Packet with PAYLOAD_TOO_LARGE and SHALL allocate no buffer sized from L or K. [unit]
14. IF L does not exceed maxPayloadBytes and K exceeds maxBlockCount, THEN THE Packet_Codec SHALL reject the Packet with TOO_MANY_BLOCKS and SHALL allocate no buffer sized from L or K. [unit]
15. FOR ALL valid header field values, `decodePacket(encodePacket(p))` SHALL equal `p`, with every header field and all blockSize payload bytes identical. [property]
16. IF L and K are within maxPayloadBytes and maxBlockCount and K != ceil(L / blockSize), THEN THE Packet_Codec SHALL reject the Packet with BAD_HEADER. [unit]

### Requirement 4: Emission modes

**User Story:** As a sender, I want an endless on-screen stream and a finite printable page, so that I can use either medium.

#### Acceptance Criteria

1. WHEN `encoder.next()` is called, THE Encoder SHALL return the next Packet of a deterministic sequence that starts with sequence numbers 0..K-1 followed by K, K+1, and so on. Two Encoders constructed with identical input and configuration SHALL return identical Packet sequences for the first 3 x K calls. [unit]
2. WHEN the sequence number would exceed 2^32 - 1, THE Encoder SHALL continue at sequence number K, so that the call following sequence number 2^32 - 1 returns a Packet with sequence number K. [unit]
3. WHEN `encoder.page()` is called, THE Encoder SHALL return an array of exactly K + repairCount Packets, holding all K Systematic_Packets with sequence numbers 0..K-1 in ascending order, followed by repairCount Repair_Packets with sequence numbers K..K+repairCount-1 in ascending order. [unit]
4. THE Encoder SHALL default repairCount to ceil(1.375 x K) - K. [unit]
5. WHERE a repairCount is configured, THE Encoder SHALL use the configured repairCount in place of the default. [unit]
6. IF a configured repairCount is not an integer, or is less than 0, or is greater than 2^32 - 1 - K, THEN THE Encoder SHALL reject the configuration with an error indicating the invalid repairCount, and SHALL leave the Encoder state unchanged. [unit]
7. WHEN a random 20% of the Packets of a default Page_Mode set are lost, THE Decoder SHALL complete with an observed success rate of at least 0.99 for K >= 50. The measurement uses N = 1000 trials for each K in {50, 100, 500}, with deterministic fast-check seeds. The number of lost Packets in each trial is round(0.20 x total Packets in the set), and the lost positions are chosen uniformly at random. The test output reports the observed rate and the Wilson_Lower_Bound for each K. [property]
8. THE Encoder SHALL provide `next()` and `page()` as synchronous functions, each returning its result directly and not a Promise. [unit]

### Requirement 5: Decoder

**User Story:** As a receiver, I want incremental decoding with progress and a verified result, so that I only receive a file that matches what was sent.

#### Acceptance Criteria

1. WHEN `push(packet)` is called, THE Decoder SHALL return a Promise that resolves to a status indicating one of accepted, ignored (with an Ignore_Reason) or rejected (with an error code). [unit]
2. WHEN the first valid Packet is pushed, THE Decoder SHALL fix the Session_Id and the stream parameters from that Packet. [unit]
3. WHEN a Packet with a known Session_Id and sequence number is pushed again, THE Decoder SHALL ignore it, report it as ignored with reason DUPLICATE_PACKET, and leave distinctPackets and all other state unchanged. [property]
4. IF a Packet has a Session_Id different from the fixed one, THEN THE Decoder SHALL report it as ignored with reason SESSION_MISMATCH and SHALL leave its state unchanged. [unit]
5. IF a Packet has the fixed Session_Id but header fields inconsistent with the fixed stream parameters, THEN THE Decoder SHALL reject it with BAD_HEADER and SHALL leave its state unchanged. [unit]
6. THE Decoder SHALL expose progress as solvedBlocks (integer from 0 to totalBlocks), totalBlocks (integer of 0 or more, fixed by the stream parameters), distinctPackets (integer of 0 or more, counting each distinct Session_Id and sequence number pair once) and a complete flag (boolean, false until criterion 10 is satisfied). [unit]
7. THE Decoder SHALL decode with belief propagation (peeling). [unit]
8. WHEN peeling stalls and the number of unsolved Blocks is at most maxGaussianBlocks, THE Decoder SHALL apply Gaussian elimination. [unit]
9. THE Decoder SHALL accept a maxGaussianBlocks parameter, an integer of 0 or more, with default 256. [unit]
10. WHEN all Blocks are solved, THE Decoder SHALL report complete only after the SHA-256 of the recovered Payload bytes equals the SHA-256 in the Metadata_Record and the recovered length equals the byte length in the Metadata_Record. [property]
11. IF the recovered hash or length does not match the Metadata_Record, THEN THE Decoder SHALL report HASH_MISMATCH, SHALL keep the complete flag false, and SHALL withhold the bytes. [unit]
12. WHEN the Decoder is complete, THE Decoder SHALL return the Payload bytes and the Metadata from the result accessor. [property]
13. IF the result accessor is called before completion, THEN THE Decoder SHALL fail with INCOMPLETE_DECODE and SHALL return no Payload bytes. [unit]
14. WHEN Packets are pushed in any order, THE Decoder SHALL produce the same recovered Payload, byte for byte, provided the same set of distinct Packets is pushed. [property]

### Requirement 6: Determinism

**User Story:** As a maintainer, I want byte-identical output everywhere, so that golden vectors and cross-engine tests are meaningful.

#### Acceptance Criteria

1. WHEN the same Payload and the same parameters are encoded twice, THE Encoder SHALL produce Packet sequences that are equal in count and byte-for-byte equal in every Packet, with zero differing bytes. [property]
2. THE PRNG SHALL be a named, integer-only algorithm seeded from the sequence number and the Session_Id, with no floating-point operation affecting any format field or Block selection. [unit]
3. WHEN the PRNG is initialized twice with the same sequence number and the same Session_Id, THE PRNG SHALL produce identical output sequences for the first 1,000 values drawn. [unit]
4. THE Codec SHALL match a golden-vector file checked into the repository in which a fixed Payload produces fixed Packet bytes, and a test SHALL fail if any Packet differs from the golden vector in count or in any byte. [unit]
5. THE Codec SHALL contain no `Math.random`, `Date.now` or `performance.now` in `src`, and a test that scans every source file under `src` SHALL report zero occurrences. [unit]
6. WHEN ESLint runs over `packages/codec/src` with the purity rules, THE ESLint configuration SHALL report an error for each use of `Math.random`, `Date.now` or `performance.now` (the symbols in criterion 5), and ESLint SHALL exit with a non-zero exit code. [unit]

### Requirement 7: Limits and typed errors

**User Story:** As an app developer, I want bounded resource use and a closed set of error codes, so that I can handle failures predictably.

#### Acceptance Criteria

1. THE Codec SHALL accept a maxPayloadBytes parameter with default 33554432 (32 MiB), and SHALL accept only integer values of 1 or more. [unit]
2. THE Codec SHALL accept a maxBlockCount parameter with default 16384, and SHALL accept only integer values of 1 or more. [unit]
3. IF a Payload length in bytes is greater than maxPayloadBytes, THEN THE Encoder SHALL reject it by throwing a CodecError with code PAYLOAD_TOO_LARGE, and SHALL produce no Packets. A Payload length equal to maxPayloadBytes SHALL be accepted. [unit]
4. IF the Payload and packetSize yield a K greater than maxBlockCount, THEN THE Encoder SHALL reject them by throwing a CodecError with code TOO_MANY_BLOCKS, and SHALL produce no Packets. A K equal to maxBlockCount SHALL be accepted. [unit]
5. THE Codec SHALL define ErrorCode as a closed union containing exactly ten values and no others: INVALID_INPUT, PAYLOAD_TOO_LARGE, TOO_MANY_BLOCKS, BAD_METADATA, BAD_HEADER, UNSUPPORTED_VERSION, BAD_CRC, SESSION_MISMATCH, INCOMPLETE_DECODE, HASH_MISMATCH (the ten values listed in the Glossary). [unit]
6. IF the Codec fails an operation, THEN THE Codec SHALL throw an instance of the single CodecError class carrying `{ code, message }`, where code is one of the ten ErrorCode values and message is a non-empty string. [unit]
7. IF a Packet-level problem occurs during `push`, THEN THE Decoder SHALL report it in the returned status without throwing and without changing Decoder state, so that the Decoder state before and after the `push` call is identical. [property]

### Requirement 8: Performance budget

**User Story:** As a user, I want encoding and decoding to feel instant for ordinary files, so that scanning is not delayed by processing.

#### Acceptance Criteria

1. WHEN a 1 MiB (1,048,576 bytes) deterministic seeded input is encoded at the default packetSize into its K Systematic_Packets, including SHA-256, framing and CRC, THE Encoder SHALL have a median wall time below 200 ms over the 20 timed runs. The method uses 3 discarded warm-up runs and 20 timed runs, with `process.hrtime.bigint`, and every run uses the same seed and the same input bytes. The output records the Node version, the CPU model and the p95 (the 19th value of the 20 timed runs sorted in ascending order). [unit]
2. WHEN a Decoder is fed ceil(1.1 x K) Packets from the 1 MiB input, including peeling, any Gaussian fallback and SHA-256 verification, THE Decoder SHALL have a median wall time below 500 ms over the 20 timed runs, using the same method as criterion 1, and SHALL return output bytes identical to the input in every timed run. [unit]
3. IF the median wall time in criterion 1 or criterion 2 is greater than or equal to its budget, THEN THE performance suite SHALL report the test as failed and SHALL print the measured median and the budget it exceeded. [unit]
4. THE performance tests SHALL live outside `packages/codec/src`, under `packages/codec/perf/`. [manual]
5. THE performance suite SHALL measure and report encode and decode times for a 32 MiB (33,554,432 bytes) payload without asserting a budget, so that the suite passes regardless of the measured times. [manual]

### Requirement 9: Public API and validation

**User Story:** As an app developer, I want one validated entry point that works in Node and browsers, so that I can use the Codec safely.

#### Acceptance Criteria

1. THE Codec SHALL export through the Barrel only: `encode(payload, options)` returning a Promise of an Encoder, `createDecoder(options)`, `serializeMetadata`, `parseMetadata`, `encodePacket`, `decodePacket`, the ErrorCode union, CodecError and Default_Hash, and SHALL export no other public symbol. [unit]
2. IF any public function receives an input that fails its Zod schema, THEN THE Codec SHALL reject with a CodecError whose code is INVALID_INPUT or a more specific member of the ErrorCode union, SHALL perform no partial processing of that input, and SHALL leave all existing Encoder and Decoder state unchanged. [property]
3. WHEN a public function is called, THE Codec SHALL validate every argument with its Zod schema before performing any other processing of that argument. [property]
4. THE Codec SHALL compile with zero TypeScript errors under a `lib` setting that excludes DOM. [unit]
5. WHEN a localhost harness page loads the built Codec in bundled Chromium, round-trips a Payload, and encodes the golden-vector Payload, THE Codec SHALL produce Packet bytes that are byte-for-byte identical (same length and same value at every index) to the Node output for the same Payload and options. [Playwright]
6. THE Codec SHALL have the dependency question in Open question 1 resolved and the resolution recorded in the requirements document before `packages/codec/package.json` is edited. [manual]

## Correctness properties to be numbered in design

- Round trip: for any Payload of 0..N bytes, pushing all systematic Packets recovers identical bytes and Metadata.
- Round trip from a random subset of about 1.1 x K distinct Packets, with the measured success bound (observed >= 0.99, N = 1000 per K in {50, 100, 500}, Wilson 95% lower bound reported).
- Order independence: any permutation of the same Packet set yields the same result.
- Duplicate and foreign-session tolerance: duplicates and foreign-session Packets leave Decoder state unchanged.
- Corruption detection: any single flipped bit anywhere in a Packet is rejected.
- Header and Metadata_Record serialize/parse round trips.
- Determinism: the same inputs yield identical bytes.
- Progress monotonicity: solvedBlocks and distinctPackets never decrease, solvedBlocks <= totalBlocks, and complete holds if and only if all Blocks are solved and the hash is verified.

## Out of scope

- QR encoding and decoding.
- Camera capture.
- Printing.
- UI.
- Compression.
- Encryption.
- Multi-file bundles.
- Adversarial or malicious Packet authentication (CRC detects corruption, not tampering).
- The symbols package.
- App code.

## Open questions

1. **Zod versus zero runtime dependencies.** `tech.md` and `structure.md` say the Codec has zero runtime dependencies, but the scope names Zod for Codec input validation. Recommended default: follow the explicit scope. Zod is the single permitted runtime dependency of `@strip/codec`. After approval, amend the `tech.md` and `structure.md` wording to "zero runtime dependencies except Zod", add the exact pin 4.6.7 to `packages/codec/package.json`, and enforce with a test that `dependencies` equals exactly `{zod}`. Alternative: hand-written validation and zero dependencies.
2. **Async hashing API.** Web Crypto digest is async. Recommended default: Hash_Function returns `Uint8Array | Promise<Uint8Array>`, `encode()` returns a Promise, `createDecoder` is sync, `push()` returns a Promise of status, and `encoder.next()` and `page()` stay sync.
3. **Session id derivation and width.** Recommended default: 4 bytes, the first 4 bytes of SHA-256 over the Metadata_Record, so the same bytes with a different name or MIME type form a different session. The foreign-session collision probability is about 2^-32 per Packet. This is accepted because the CRC and the final SHA-256 still gate completion.
4. **Success-bound attainability and pool.** Plain LT at small K (50) may not reach 0.99 from 1.1 x K Packets. Recommended default: assert the bound on the mixed pool [0, 3K) as specified and report the repair-only pool informationally. If the measured rate is below 0.99 at any K, stop and report the overhead needed for 0.99, and let the user choose between raising the overhead factor, tuning c and delta, or widening the Gaussian fallback. The bound is not loosened silently.
5. **Large-payload scaling.** At the 32 MiB cap with the default packetSize, K is about 11,479, and Gaussian elimination is bounded by maxGaussianBlocks. Recommended default: no performance budget at 32 MiB, but measure and report it, with maxGaussianBlocks default 256 and maxBlockCount default 16384.
