# Requirements Document

## Introduction

`@strip/symbols` (packages/symbols) wraps QR Code encoding and decoding for Strip. It turns one codec Packet (1..2953 bytes) into a QR symbol, renders the symbol to canvas or SVG, and decodes a symbol from camera or image pixels back to the exact Packet bytes. It sits between `@strip/codec` and `apps/strip`: it imports codec types only, and apps import only its public barrel. Everything runs client-side under a strict Content Security Policy, with no network use at runtime.

The QR library pair is not chosen yet. Requirements are written against internal encoder and decoder interfaces, and the library decision is open question 1. Measured numeric claims (capture conditions, timing) are stated as measurements with a sample size and method, never as guarantees. Packet production, loss recovery and framing belong to the codec spec and are not restated here.

## Glossary

- **Symbols_Package**: The package `@strip/symbols` in packages/symbols.
- **Packet**: A Uint8Array produced by the codec, carried as the payload of one QR symbol.
- **ECC_Level**: One of the QR error-correction levels L, M, Q, H.
- **Capacity**: The maximum number of bytes in byte mode, single segment, at version 40 for an ECC_Level: 2953 (L), 2331 (M), 1663 (Q), 1273 (H).
- **Symbol_Matrix**: The public renderer-independent description of a QR symbol: size in modules, row-major boolean modules, version, ECC_Level and mask.
- **Quiet_Zone**: The blank border around a symbol, in modules.
- **Encoder**: The internal interface in src that produces a Symbol_Matrix from bytes, ECC_Level and options.
- **Decoder_Backend**: The internal interface in src that decodes a symbol from RGBA pixels.
- **ImageData_Like**: An object `{ width, height, data }` where data is a Uint8ClampedArray of RGBA bytes with length width x height x 4.
- **Frame_Decoder**: The object returned by `createFrameDecoder` for repeated decoding of camera frames.
- **Not_Found**: The typed decode outcome meaning that no symbol was found in the input.
- **SymbolError**: The error class of the Symbols_Package, carrying `{ code, message }`.
- **Golden_Matrix**: A committed JSON Symbol_Matrix produced once by an independent Python implementation through a script, under the same policy as the codec golden vectors.
- **Degradation_Family**: One of rotation, perspective skew, blur, low light with sensor noise, glare gradient, occlusion (solid block or scattered), inverted polarity.
- **Wilson_Lower_Bound**: The lower end of the Wilson 95% confidence interval for an observed success proportion.
- **Strict_CSP**: A Content Security Policy of `default-src 'self'` with `script-src 'self'`, adding only the keywords that a criterion names explicitly.
- **Harness_Page**: The localhost page served for Playwright tests.
- **Perf_Method**: Median of 20 runs after 3 warm-ups, timed with `process.hrtime.bigint` in perf scripts outside src.

## Requirements

### Requirement 1: Capacity and encoding

**User Story:** As the app, I want to turn a codec Packet into a QR symbol of the smallest fitting version, so that each symbol carries as much as possible and decodes back byte for byte.

#### Acceptance Criteria

1. WHEN `encodeSymbol` receives a Uint8Array of 1 to Capacity bytes for the selected ECC_Level, THE Symbols_Package SHALL return a Symbol_Matrix encoded in byte mode as a single segment with no ECI header. [unit]
2. THE Symbols_Package SHALL select the smallest version in 1..40 whose byte capacity at the selected ECC_Level is at least the Packet length. [property]
3. THE Symbols_Package SHALL accept the ECC_Level options L, M, Q and H, and SHALL use L when no ECC_Level is given. [unit]
4. THE Symbols_Package SHALL export QR_CAPACITY with the values 2953 (L), 2331 (M), 1663 (Q) and 1273 (H), defined in its own source without importing runtime values from `@strip/codec`. [unit]
5. IF the Packet length exceeds QR_CAPACITY for the selected ECC_Level, THEN THE Symbols_Package SHALL throw a SymbolError with code PACKET_TOO_LARGE. [property]
6. WHEN the Packet length equals QR_CAPACITY for the selected ECC_Level, THE Symbols_Package SHALL return a version 40 Symbol_Matrix. [property]
7. FOR ALL byte values 0x00 to 0xFF, encoding a Packet containing that value and decoding the rendered symbol SHALL return the identical bytes. [unit]
8. FOR ALL Packets of 1 to Capacity bytes and each ECC_Level, encoding then decoding the Symbol_Matrix pixels SHALL return the identical bytes (round-trip property). [property]
9. THE Symbols_Package SHALL choose the mask deterministically, so that identical bytes and options produce an identical module matrix. [property]
10. THE test suite SHALL include a test outside src that asserts the codec default packet size equals QR_CAPACITY at L, and that each codec packetSize in 46..65565 that is at most the Capacity of an ECC_Level is accepted at that level. [unit]
11. THE src of the Symbols_Package SHALL import only types from `@strip/codec`. [unit]

### Requirement 2: Module matrix

**User Story:** As a renderer author, I want a Symbol_Matrix independent of every renderer, so that canvas, SVG and tests share one source of truth.

#### Acceptance Criteria

1. THE Symbols_Package SHALL export a Symbol_Matrix type with the fields size, modules (row-major boolean), version, ecc and mask, where modules.length equals size x size and size equals 17 + 4 x version. [unit]
2. THE Symbols_Package SHALL treat the Quiet_Zone as a rendering option with a default of 4 modules. [unit]
3. IF a rendering option sets a Quiet_Zone below 4 modules without the option `allowShortQuietZone`, THEN THE Symbols_Package SHALL throw a SymbolError with code INVALID_INPUT. [unit]
4. FOR ALL encoded Symbol_Matrix values, THE finder patterns, separators, timing patterns, the dark module, format information and (for version 7 and above) version information SHALL match the QR specification. [property]
5. THE test suite SHALL compare Symbol_Matrix output against Golden_Matrix files for a committed set of inputs covering versions 1, 2, 7, 10, 20, 30 and 40 at each ECC_Level. [unit]
6. THE Golden_Matrix generation script SHALL be run once, and the generated JSON files SHALL be committed together with the script and the name and version of the Python implementation used. [manual]

### Requirement 3: Canvas rendering

**User Story:** As the app, I want to draw a symbol on a canvas at a crisp integer scale, so that screens and printers show exact module edges.

#### Acceptance Criteria

1. WHEN `renderToCanvas` receives a Symbol_Matrix and a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D, THE Symbols_Package SHALL draw the symbol with the Quiet_Zone at an integer number of pixels per module. [unit]
2. THE Symbols_Package SHALL accept the context through a structural type so that src needs no DOM lib dependency for the public types. [unit]
3. THE Symbols_Package SHALL draw every module as a filled rectangle with integer coordinates and with image smoothing disabled, so that no module edge contains a blended pixel. [Playwright]
4. WHERE colors are configured, THE Symbols_Package SHALL draw dark modules and light modules in those colors, and SHALL default to black on white. [unit]
5. WHEN `fitScale` receives a Symbol_Matrix, a Quiet_Zone and a target box, THE Symbols_Package SHALL return the largest integer pixels-per-module that fits the box together with the resulting pixel width and height. [property]
6. IF the target box is too small for 1 pixel per module, THEN THE Symbols_Package SHALL return a scale of 0 and zero pixel size without throwing. [unit]

### Requirement 4: SVG rendering

**User Story:** As the app, I want an SVG string of a symbol, so that print output scales without raster blur and passes a strict CSP.

#### Acceptance Criteria

1. WHEN `renderToSvg` receives a Symbol_Matrix, THE Symbols_Package SHALL return an SVG markup string with a viewBox in module units that includes the Quiet_Zone. [unit]
2. THE Symbols_Package SHALL emit shape-rendering="crispEdges" and draw the dark modules as a single path or as merged rects. [unit]
3. WHERE a physical size in millimetres is given, THE Symbols_Package SHALL set width and height attributes in mm. [unit]
4. THE Symbols_Package SHALL set colors with presentation attributes only. [unit]
5. FOR ALL rendered SVG strings, THE markup SHALL contain no script element, no style element, no style attribute, no event-handler attribute, no external reference and no data: or URL fetch. [property]
6. FOR ALL Symbol_Matrix values, rasterizing the SVG in Chromium and decoding the result SHALL return the input bytes. [Playwright]

### Requirement 5: Decoding from pixels

**User Story:** As the receiver, I want to read the exact Packet bytes out of a camera frame, so that the codec can consume them.

#### Acceptance Criteria

1. WHEN `decodeFrame` receives an ImageData_Like that contains a QR symbol, THE Symbols_Package SHALL return a result with the exact Packet bytes as a Uint8Array. [unit]
2. WHERE the Decoder_Backend reports them, THE Symbols_Package SHALL include the symbol version, the ECC_Level and the corner points in the result. [unit]
3. IF the ImageData_Like contains no symbol, THEN THE Symbols_Package SHALL return a Not_Found outcome and SHALL NOT throw. [property]
4. IF the decoded payload is longer than 2953 bytes, THEN THE Symbols_Package SHALL return a typed outcome stating that the symbol is not a Strip packet. [unit]
5. IF the input has non-integer or non-positive width or height, a data field that is not a Uint8ClampedArray, or a data length different from width x height x 4, THEN THE Symbols_Package SHALL throw a SymbolError with code INVALID_INPUT, validated by hand-written code before any other processing. [property]
6. THE Symbols_Package SHALL return Packet bytes that are binary safe for every byte value 0x00 to 0xFF. [unit]

### Requirement 6: Capture conditions

**User Story:** As a user scanning a screen or a print, I want decoding to tolerate real capture conditions, so that scanning works without perfect framing.

#### Acceptance Criteria

1. WHEN the Decoder receives a clean synthetic rendering of each version 1..40 at each ECC_Level at 4 pixels per module and at 8 pixels per module, THE Symbols_Package SHALL return the encoded bytes in 100% of the 320 deterministic fixtures. [unit]
2. THE Symbols_Package SHALL decode synthetic degradations of rendered symbols for each Degradation_Family as far as the chosen decoder library allows, and each family SHALL be reported as a measured claim. [property]
3. THE measurement SHALL use N seeded trials per cell (a cell is one Degradation_Family parameter value at one version class), a seeded PRNG and fast-check seeds only, with no Math.random. [property]
4. THE measurement output SHALL report, for each cell, the observed rate, N and the Wilson_Lower_Bound. [property]
5. THE Degradation_Family parameters SHALL be: rotation 0..359 degrees; perspective skew up to a stated angle; Gaussian blur of a stated sigma in module units; brightness scaled to stated fractions plus noise; occlusion of a stated fraction of modules as a solid block or scattered; inverted polarity. [property]
6. WHEN the design phase has measured the baseline, THE test suite SHALL assert fresh-seed rates only for cells chosen from that baseline (open question 3) and SHALL report all other cells as informational output with no assertion. [property]
7. THE real-device validation on printed strips and phone screens SHALL be recorded as a manual check with device, distance and result. [manual]

### Requirement 7: Camera loop use

**User Story:** As the receiver, I want a reusable frame decoder, so that a live camera loop decodes frames without per-frame allocation or stalls.

#### Acceptance Criteria

1. WHEN `createFrameDecoder` receives a maximum frame size, THE Symbols_Package SHALL preallocate its working memory for that size and reuse it for each frame. [unit]
2. WHERE an effort option or a per-frame time budget option is given, THE Frame_Decoder SHALL apply it to each frame. [unit]
3. THE Frame_Decoder SHALL default to settings tuned for video, and WHERE photo mode is selected THE Frame_Decoder SHALL spend more effort on a single image. [unit]
4. IF a frame is larger than the maximum frame size given at creation, THEN THE Frame_Decoder SHALL throw a SymbolError with code INVALID_INPUT. [unit]
5. THE perf script SHALL report the decode time of a 1280x720 frame by the Perf_Method, with the frame content, version and ECC_Level stated, and the budget SHALL be set by open question 3. [perf]
6. THE perf script SHALL report the encode time of a 2953-byte Packet at L by the Perf_Method. [perf]

### Requirement 8: Errors

**User Story:** As the app developer, I want a closed set of typed errors and a non-throwing frame miss, so that the camera loop and UI handle failures predictably.

#### Acceptance Criteria

1. THE Symbols_Package SHALL export SYMBOL_ERROR_CODES as the closed set INVALID_INPUT, PACKET_TOO_LARGE, ENCODE_FAILED and UNSUPPORTED_ENVIRONMENT, and a SymbolError class carrying `{ code, message }`. [unit]
2. WHEN a frame contains no decodable symbol, THE Symbols_Package SHALL return Not_Found and SHALL NOT throw. [property]
3. WHEN a public function receives input of the wrong type, shape or range, THE Symbols_Package SHALL validate it with hand-written validators and throw a SymbolError with code INVALID_INPUT before any other processing. [property]
4. IF the Encoder fails for a reason other than input validation, THEN THE Symbols_Package SHALL throw a SymbolError with code ENCODE_FAILED. [unit]
5. IF a required platform feature is missing (for example a Canvas context method), THEN THE Symbols_Package SHALL throw a SymbolError with code UNSUPPORTED_ENVIRONMENT. [unit]
6. FOR ALL thrown errors from public functions, THE error SHALL be a SymbolError whose code is in SYMBOL_ERROR_CODES. [property]

### Requirement 9: CSP and self-hosting

**User Story:** As the app owner, I want the package to run under a strict CSP with every asset served from the same origin, so that the app makes no network request to any other origin.

#### Acceptance Criteria

1. THE Symbols_Package SHALL work without eval, without `new Function`, without dynamic import from a remote origin, without inline script or style, and without network requests at runtime to any origin. [Playwright]
2. WHERE the chosen backend needs a non-JavaScript asset (for example a WebAssembly binary), THE app build SHALL bundle that asset and serve it from the same origin, never from a CDN. [Playwright]
3. WHERE the chosen decoder or encoder instantiates WebAssembly, THE app CSP SHALL include 'wasm-unsafe-eval' in script-src (supported by Chrome 97+, Firefox 102+, Safari 16+). The keyword permits compiling and instantiating WebAssembly only and does not permit eval() or new Function(), which would need 'unsafe-eval'. [Playwright]
4. WHERE the chosen backend fetches a same-origin .wasm file, THE app CSP SHALL include connect-src 'self' or default-src 'self'. [Playwright]
5. WHERE the encoder and decoder are pure JavaScript, THE app CSP SHALL need no change to script-src. [Playwright]
6. WHEN the Harness_Page is served with a Strict_CSP header, THE test SHALL run encode, render, decode and a round trip and observe zero securitypolicyviolation events and zero console errors. The header SHALL add 'wasm-unsafe-eval' to script-src only if the backend needs it, and img-src 'self' blob: data: only if a test needs it, with the reason written next to the header in the test. [Playwright]

### Requirement 10: Determinism and purity

**User Story:** As a maintainer, I want the symbol output to be a pure function of its inputs, so that results are reproducible across Node and Chromium.

#### Acceptance Criteria

1. THE src of the Symbols_Package SHALL contain no Math.random, Date.now or performance.now, enforced by ESLint and the existing purity script. [unit]
2. THE Symbols_Package SHALL compute the Symbol_Matrix as a pure function of (bytes, options). [property]
3. WHEN the Golden_Matrix inputs are encoded in Node and in Chromium, THE Symbols_Package SHALL produce matrices identical to the Golden_Matrix files in both. [Playwright]

### Requirement 11: Dependencies

**User Story:** As the project owner, I want to approve every dependency before it is added, so that supply-chain risk stays under my control.

#### Acceptance Criteria

1. UNTIL the user approves the QR library pair, THE packages/symbols/package.json SHALL contain no runtime or dev dependency. [unit]
2. WHEN a dependency is approved and added, THE commit SHALL pin it to an exact version and add its row (name, exact version, license, reason) to docs/dependencies.md, as enforced by tools/deps.test.ts. [unit]
3. THE Symbols_Package SHALL keep the QR Encoder and the Decoder_Backend behind internal interfaces in src, so that a backend can be replaced without changing the public API. [unit]
4. THE public barrel SHALL expose no type or value from any QR library. [unit]

### Requirement 12: Public API

**User Story:** As the app developer, I want one public barrel, so that I import only a stable surface.

#### Acceptance Criteria

1. THE Symbols_Package SHALL export from src/index.ts, as runtime symbols, exactly: encodeSymbol, renderToCanvas, renderToSvg, fitScale, decodeFrame, createFrameDecoder, SymbolError, SYMBOL_ERROR_CODES and QR_CAPACITY. [unit]
2. THE Symbols_Package SHALL export from src/index.ts, as type-only symbols, the types Symbol_Matrix, ECC_Level, encode options, render options, decode options, decode result (including Not_Found), Frame_Decoder and SymbolErrorCode. [unit]
3. THE Symbols_Package SHALL expose the barrel through the package `exports` field, and a test SHALL assert that the runtime export list matches criterion 1 exactly. [unit]

### Requirement 13: Integration with the codec

**User Story:** As the app developer, I want proof that codec output survives the whole symbol path, so that a file sent as symbols is received intact.

#### Acceptance Criteria

1. WHEN the integration test encodes a file with the codec, converts each Packet with `encodeSymbol`, renders it with `renderToCanvas` and with `renderToSvg`, rasterizes it in Chromium, decodes it with `decodeFrame`, and feeds the decoded bytes to the codec decoder, THE codec decoder SHALL complete with file bytes identical to the input. [Playwright]
2. WHEN the same Packets are converted to an ImageData_Like in Node from the Symbol_Matrix, THE codec decoder SHALL complete with file bytes identical to the input. [unit]
3. THE integration test SHALL live outside src and MAY import runtime values from `@strip/codec`. [unit]

## Correctness properties to be numbered in design

- Round trip of any byte array of 1..Capacity bytes for each ECC_Level (encode, render, decode equals input).
- Determinism of the Symbol_Matrix for identical bytes and options.
- Matrix invariants (finder, timing, format, version information, size and length) hold for random inputs.
- Render, rasterize, decode equals the input for canvas and for SVG.
- Rotation invariance at fixed scale for any of 360 degrees.
- Occlusion within the ECC capacity decodes.
- Not_Found for blank and noise frames, and decoding never throws for them.
- Capacity boundary: Capacity bytes accepted and Capacity+1 rejected with PACKET_TOO_LARGE, for each ECC_Level.
- Every codec packet size from the codec spec that fits an ECC_Level is accepted at that level.
- Every SVG output is free of script, style, event handlers and external references.
- `fitScale` returns the largest integer scale that fits the target box.

## Out of scope

- Camera access and getUserMedia (the app).
- UI.
- Print layout and multi-symbol sheets.
- Animation timing.
- Micro QR, rMQR and other symbologies.
- Kanji, numeric, alphanumeric and mixed-mode segments.
- ECI.
- Structured append.
- Logos in the symbol.
- Colour symbols.
- Compression.
- Encryption.

## Resolved questions

None yet. The dependency decision (open question 1) is pending, and no dependency is added until the user approves it.

## Open questions

1. **QR library pair.** Which encoder and decoder libraries does the Symbols_Package use? All packages below were checked on the npm registry on the day of writing. "Unpacked size" is the npm unpacked size of the package. The wasm sizes are the shipped binaries. Bundle sizes are the authors' minified+gzipped numbers where stated.

   | package | role | version | licence | unpacked size | maintenance | bundled or fetched | CSP implication |
   |---|---|---|---|---|---|---|---|
   | qr (paulmillr) | encode + decode (pure JS) | 0.7.2 | MIT OR Apache-2.0 | 539 KB package; 5.4 KB gz encoder, 11.5 KB gz encoder+decoder | zero dependencies, 23 releases, latest 2026-09-28 | bundled ES module, nothing fetched | none (pure JS, no eval); camera/DOM helpers in qr/dom.js not needed |
   | uqr | encode (pure JS) | 0.1.3 | MIT | 79 KB | 9 releases, latest 2026-04-03 | bundled | none; string input, binary-safety unconfirmed |
   | qrcode-generator | encode (pure JS) | 2.0.4 | MIT | 556 KB | 24 releases, latest 2025-08-07 | bundled | none; byte mode on 8-bit characters (binary via charCodes) |
   | qrcode (node-qrcode) | encode | 1.5.4 | MIT | 135 KB | last release 2024-08 | bundled | none; slower than qr by the qr author's benchmark |
   | jsQR | decode (pure JS) | 1.4.0 | Apache-2.0 | 280 KB | last release 2021-04-24, unmaintained | bundled | none; returns binaryData; slow on large frames (351 ms at 1080p in the qr author's benchmark) |
   | @zxing/library | decode (pure JS, all formats) | 0.23.0 | Apache-2.0 | 11.9 MB | latest 2026-04-29 | bundled | none; heavy, 11 ms at 1080p in the qr author's benchmark |
   | qr-scanner (nimiq) | decode (pure JS in a Web Worker) | 1.4.2 | MIT | 524 KB | last release 2022-11-23 | bundled, worker created from a blob | worker-src blob: likely needed (to verify) |
   | zxing-wasm | decode (reader) + encode (writer), WebAssembly | 3.1.7 | MIT (zxing-cpp Apache-2.0, zint BSD-3-Clause) | 3.7 MB package; reader .wasm 946,598 B, writer .wasm 667,487 B, full 1,545,839 B | 70 releases, latest 2026-11-15, very active | ES module + .wasm; BY DEFAULT THE .wasm IS FETCHED FROM jsDelivr (CDN) at first use: must be overridden with locateFile/wasmBinary to self-host | 'wasm-unsafe-eval' in script-src, same-origin connect-src for the .wasm; no new Function in the shipped glue (checked by grep) |
   | barcode-detector | decode (polyfill over zxing-wasm) | 3.2.4 | MIT | 255 KB | active, latest 2026-11-15 | same as zxing-wasm | same as zxing-wasm |
   | rxing-wasm | decode + encode (Rust ZXing port, WebAssembly) | 0.5.9 | Apache-2.0 | 2.5 MB | latest 2026-11-08 | .wasm | 'wasm-unsafe-eval' |
   | @undecaf/zbar-wasm | decode (WebAssembly) | 0.11.0 | LGPL-2.1+ | 3.3 MB | latest 2024-05-22 | .wasm | 'wasm-unsafe-eval'; LGPL copyleft needs review |

   Accuracy figures are third-party, from the qr author's own benchmark on the BoofCV photo vectors, and we will re-measure them: qr 57.5% default and 60.6% at maximum effort; zxing-cpp 50% in fast mode and 75% in slow (try-harder) mode. Speed figures are also third-party, for successful decodes at 720p: qr 2.4 ms, zxing-wasm 2.4 ms, @zxing/library 3.6 ms, jsQR 23.8 ms.

   Recommended default (NOT a decision): `qr` (paulmillr) for both encoding and decoding. It is a single zero-dependency pure-JS package (MIT OR Apache-2.0) with no WebAssembly, no CDN fetch and no CSP change. It is small and actively maintained, has a binary hook (`textEncoder` for encode, `textDecoder` for decode), and has an effort and time-budget API built for camera loops. Keep the decoder behind the internal interface so that `zxing-wasm/reader` (self-hosted, with 'wasm-unsafe-eval') can be added later as an opt-in fallback, only if our own measurements on real prints and screens show `qr` is not good enough. Nothing is added to package.json or docs/dependencies.md until the user approves.

2. **Binary safety of the recommended pair.** `qr`'s API is string based: encode takes a string and a `textEncoder` hook, and decode returns a string and accepts a `textDecoder` hook. Recommended default (NOT a decision): prove a byte-for-byte round trip of all 256 byte values and of random 1..2953-byte Packets, using a Latin-1 style identity mapping, in a spike BEFORE the pair is approved. If the spike fails, use qrcode-generator (8-bit characters) for encoding and keep `qr` for decoding, or switch both to zxing-wasm, which takes Uint8Array.

3. **Capture-condition thresholds and performance budgets.** Recommended default (NOT a decision): measure baselines in the design phase on seeded synthetic degradations (rotation, perspective, blur, low light with noise, glare gradient, occlusion, inversion) with N = 1000 trials per cell (N = 300 for the heaviest versions). Then assert fresh-seed rates at the 0.99 level only for cells that pass at 0.99 in the baseline, and report the other cells as informational. Budget for a 1280x720 frame: median under 50 ms (the qr author reports 2.4 ms), and encode of a 2953-byte Packet under 50 ms, both by the Perf_Method. Real-device validation stays manual.

4. **ECC level and packet size policy.** Recommended default (NOT a decision): ECC L as the default (2953 bytes, equal to the codec default packet size), with M, Q and H selectable. For print or poor cameras, the app picks a smaller codec packetSize (for example 2331, which fits M, or 1663, which fits Q) and the matching ECC level, so that redundancy is traded against capacity per symbol instead of being hard-coded. The Symbols_Package exposes the capacity table and the app chooses.

5. **CSP posture.** Recommended default (NOT a decision): the app CSP stays `default-src 'self'` with `script-src 'self'` and NO 'wasm-unsafe-eval' as long as the pure-JS pair is used. If the zxing-wasm fallback is ever enabled, add 'wasm-unsafe-eval' to script-src only (it permits WebAssembly compilation, not eval or new Function), self-host the .wasm (same origin, connect-src 'self'), and never keep the jsDelivr default. SVG and canvas outputs avoid inline styles, so style-src needs no 'unsafe-inline'.
