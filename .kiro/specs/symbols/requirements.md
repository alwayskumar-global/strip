# Requirements Document

## Introduction

`@strip/symbols` (packages/symbols) wraps QR Code encoding and decoding for Strip. It turns one codec Packet (1..2953 bytes) into a QR symbol, renders the symbol to canvas or SVG, and decodes a symbol from camera or image pixels back to the exact Packet bytes. It sits between `@strip/codec` and `apps/strip`: it imports codec types only, and apps import only its public barrel. Everything runs client-side under the Strip_CSP, with no network use at runtime except the same-origin load of one WebAssembly file.

The library pair is decided (see Resolved questions): `qr` (paulmillr) 0.7.2 encodes, and `zxing-wasm` 3.1.7 (reader build only) decodes. Both are exact-pinned and approved by the user (Resolved questions 7). Requirements are still written against internal Encoder and Decoder_Backend interfaces, so that a backend can be replaced without changing the public API. Measured numeric claims (capture conditions, timing) are stated as measurements with a sample size and method, never as guarantees. The measurements come from the committed spike report `docs/spikes/symbols-decoder.md`. Packet production, loss recovery and framing belong to the codec spec and are not restated here.

Each acceptance criterion ends with a tag naming how it is verified: [unit] (fast example or table test in `pnpm test`), [property] (fast-check property in `pnpm test`), [measured] (seeded statistical or batch run in `pnpm test:measured`, outside the fast suite for cost), [perf] (Perf_Method script), [Playwright] (Chromium harness test) and [manual] (recorded human check).

## Glossary

- **Symbols_Package**: The package `@strip/symbols` in packages/symbols.
- **Packet**: A Uint8Array produced by the codec, carried as the payload of one QR symbol.
- **ECC_Level**: One of the QR error-correction levels L, M, Q, H.
- **Capacity**: The maximum number of bytes in byte mode, single segment, at version 40 for an ECC_Level: 2953 (L), 2331 (M), 1663 (Q), 1273 (H). At version 30 the byte capacities are 1732 (L), 1370 (M), 982 (Q), 742 (H).
- **Symbol_Matrix**: The public renderer-independent description of a QR symbol: size in modules, row-major boolean modules, version, ECC_Level and mask.
- **Quiet_Zone**: The blank border around a symbol, in modules.
- **Encoder**: The internal interface in src that produces a Symbol_Matrix from bytes, ECC_Level and options. Its implementation uses `qr` 0.7.2, encoder only.
- **Decoder_Backend**: The internal interface in src that decodes a symbol from RGBA pixels. Its implementation uses `zxing-wasm` 3.1.7, reader build only.
- **Wasm_Loader**: The injected seam through which the app passes the reader .wasm to the Symbols_Package, as a URL or as bytes. The app obtains the URL from the Wasm_URL_Module. The Symbols_Package overrides the zxing-wasm default CDN location through the zxing-wasm module overrides (`locateFile` or `wasmBinary`).
- **Wasm_URL_Module**: The single file `packages/symbols/src/wasm-url.ts`, exposed as the only subpath export `@strip/symbols/wasm-url`. It holds the Vite-only `?url` import of `zxing-wasm/reader/zxing_reader.wasm`, so Vite resolves the file from the Symbols_Package. No other file of the Symbols_Package imports it or any `?url` module.
- **ImageData_Like**: An object `{ width, height, data }` where data is a Uint8ClampedArray of RGBA bytes with length width x height x 4.
- **Frame_Decoder**: The object returned by `createFrameDecoder` for repeated decoding of camera frames.
- **Not_Found**: The typed decode outcome meaning that no symbol was found in the input.
- **SymbolError**: The error class of the Symbols_Package, carrying `{ code, message }`.
- **ISO_Capacity_Table**: The committed table in `test/fixtures` holding the ISO/IEC 18004 byte-mode capacity for every version 1..40 at every ECC_Level (160 values), typed from the standard and independent of the package source.
- **Degradation_Family**: One of rotation, perspective skew, blur, low light with sensor noise, glare gradient, occlusion (solid block or scattered), inverted polarity.
- **Typical_Profile**: The synthetic typical-phone degradation profile of the spike: rotation up to ±5°, perspective up to ±4%, 70% contrast, 4% noise (sd about 10 levels of 255), mild brightness gradient (about ±10 levels), with blur sigma stated per test.
- **Harsh_Profile**: The synthetic worst-case profile of the spike: rotation up to ±10°, perspective up to ±8%, 50% contrast, 8% noise, brightness gradient about ±16 levels. It is informational and is not a pass bar.
- **Wilson_Lower_Bound**: The lower end of the Wilson 95% confidence interval for an observed success proportion.
- **Default_Cell**: The symbol configuration chosen for both screen and print: version 30, ECC_Level L, packet size 1732 bytes, minimum 4 pixels per module.
- **Strip_CSP**: The Content Security Policy defined verbatim in Requirement 9, criterion 3.
- **Harness_Page**: The localhost page served for Playwright tests. The harness serves the Strip_CSP as an HTTP header.
- **Reference_Machine**: Apple M2 Pro running Node 25.9, the machine on which the spike measured timing and on which budgets are stated.
- **Perf_Method**: Median of 20 runs after 3 warm-ups, timed with `process.hrtime.bigint` in perf scripts outside src, on the Reference_Machine.
- **THIRD_PARTY_NOTICES**: The file, named exactly `THIRD_PARTY_NOTICES`, that the app ships and that lists each shipped third-party component with its licence text.

## Requirements

### Requirement 1: Capacity and encoding

**User Story:** As the app, I want to turn a codec Packet into a QR symbol of the smallest fitting version, so that each symbol carries as much as possible and decodes back byte for byte.

#### Acceptance Criteria

1. WHEN `encodeSymbol` receives a Uint8Array of 1 to Capacity bytes for the selected ECC_Level, THE Symbols_Package SHALL return a Symbol_Matrix encoded in byte mode as a single segment with no ECI header. [unit]
2. THE Symbols_Package SHALL select the smallest version in 1..40 whose byte capacity at the selected ECC_Level is at least the Packet length, unless a version option is given. [property]
3. THE Symbols_Package SHALL accept the ECC_Level options L, M, Q and H, and SHALL use L when no ECC_Level is given. [unit]
4. THE Symbols_Package SHALL export QR_CAPACITY with the values 2953 (L), 2331 (M), 1663 (Q) and 1273 (H), and QR_CAPACITY_BY_VERSION with the byte-mode capacity for every version 1..40 at every ECC_Level, both defined in its own source without importing runtime values from `@strip/codec`. The table SHALL include 1732, 1370, 982 and 742 at version 30 and the QR_CAPACITY values at version 40. [unit]
5. IF the Packet length exceeds the capacity of the selected version and ECC_Level (QR_CAPACITY when no version is given), THEN THE Symbols_Package SHALL throw a SymbolError with code PACKET_TOO_LARGE. [property]
6. WHEN the Packet length equals QR_CAPACITY for the selected ECC_Level, THE Symbols_Package SHALL return a version 40 Symbol_Matrix. [property]
7. FOR ALL byte values 0x00 to 0xFF, encoding a Packet containing that value and decoding the rendered symbol with the pinned zxing-wasm Decoder_Backend SHALL return the identical bytes. [unit]
8. FOR ALL Packets of 1 to Capacity bytes and each ECC_Level, encoding then decoding the Symbol_Matrix pixels with the pinned zxing-wasm Decoder_Backend SHALL return the identical bytes (round-trip property). [property]
9. THE Symbols_Package SHALL choose the mask deterministically, so that identical bytes and options produce an identical module matrix. [property]
10. THE test suite SHALL include a test outside src that asserts the codec default packet size remains 2953 and equals QR_CAPACITY at L (this spec does not change the codec default), that the QR_DEFAULTS packet size equals the version 30 capacity at L (1732), and that each codec packetSize in 46..65565 that is at most the Capacity of an ECC_Level is accepted at that level. [unit]
11. THE src of the Symbols_Package SHALL import only types from `@strip/codec`. [unit]
12. WHERE a version option in 1..40 is given, THE Symbols_Package SHALL encode at exactly that version, and IF the Packet does not fit that version at the selected ECC_Level, THEN THE Symbols_Package SHALL throw a SymbolError with code PACKET_TOO_LARGE. [property]
13. THE Encoder SHALL map each Packet byte to the character with the same code (Latin-1) and SHALL force byte mode, so that no byte is altered by text encoding. [unit]
14. THE test suite SHALL assert that the ISO_Capacity_Table equals QR_CAPACITY_BY_VERSION for all 160 version and ECC_Level cells, and SHALL cross-check it at runtime by calling `encodeSymbol` with an explicit version for each cell, with a payload of exactly the table capacity (expecting success at that version) and with a payload of capacity + 1 bytes (expecting a SymbolError with code PACKET_TOO_LARGE). [unit]

### Requirement 2: Module matrix

**User Story:** As a renderer author, I want a Symbol_Matrix independent of every renderer, so that canvas, SVG and tests share one source of truth.

#### Acceptance Criteria

1. THE Symbols_Package SHALL export a Symbol_Matrix type with the fields size, modules (row-major boolean), version, ecc and mask, where modules.length equals size x size and size equals 17 + 4 x version. [unit]
2. THE Symbols_Package SHALL treat the Quiet_Zone as a rendering option with a default of 4 modules. [unit]
3. IF a rendering option sets a Quiet_Zone below 4 modules without the option `allowShortQuietZone`, THEN THE Symbols_Package SHALL throw a SymbolError with code INVALID_INPUT. [unit]
4. FOR ALL encoded Symbol_Matrix values, THE finder patterns, separators, timing patterns, the dark module, format information and (for version 7 and above) version information SHALL match the QR specification. [property]

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

**User Story:** As the app, I want an SVG string of a symbol, so that print output scales without raster blur and passes the Strip_CSP.

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
6. THE Symbols_Package SHALL return Packet bytes that are binary safe for every byte value 0x00 to 0xFF, taken from the raw byte output of the Decoder_Backend (zxing-wasm `result.bytes`) with no text decoding. [unit]
7. WHEN the Decoder_Backend is first needed (by `decodeFrame` or by `createFrameDecoder`), THE Symbols_Package SHALL compile and instantiate the reader .wasm from the source given by the Wasm_Loader, once per page, and SHALL complete decoding asynchronously. THE `createFrameDecoder` function SHALL return a Promise that resolves after that initialisation (see Requirement 7, criterion 1). [unit]
8. IF no Wasm_Loader source is given when the Decoder_Backend is first needed, THEN THE Symbols_Package SHALL throw a SymbolError with code INVALID_INPUT and SHALL NOT fetch from any default location. [unit]

### Requirement 6: Capture conditions

**User Story:** As a user scanning a screen or a print, I want decoding to tolerate real capture conditions, so that scanning works without perfect framing.

#### Acceptance Criteria

1. WHEN the Decoder_Backend receives a clean synthetic rendering of each version 1..40 at each ECC_Level at 4 pixels per module and at 8 pixels per module, THE Symbols_Package SHALL return the encoded bytes in 100% of the 320 deterministic fixtures. [measured]
2. THE Symbols_Package SHALL decode synthetic degradations of rendered symbols for each Degradation_Family as far as zxing-wasm allows, and each family SHALL be reported as a measured claim. [property]
3. THE measurement SHALL use N seeded trials per cell (a cell is one Degradation_Family parameter value at one version class), a seeded PRNG and fast-check seeds only, with no Math.random. [property]
4. THE measurement output SHALL report, for each cell, the observed rate, N and the Wilson_Lower_Bound. [property]
5. THE Degradation_Family parameters SHALL be: rotation 0..359 degrees; perspective skew up to a stated angle; Gaussian blur of a stated sigma in module units; brightness scaled to stated fractions plus noise; occlusion of a stated fraction of modules as a solid block or scattered; inverted polarity. [property]
6. THE test suite SHALL assert fresh-seed rates only for the Default_Cell under the Typical_Profile (criteria 8 and 9) and SHALL report every other cell, including every Harsh_Profile cell, as informational output with no assertion. [property]
7. THE real-device validation on printed strips and phone screens SHALL be recorded as a manual check with device, distance and result. [manual]
8. WHEN the Default_Cell is rendered at 4 pixels per module and degraded by the Typical_Profile at blur sigma 1 pixel for screen use, with N = 200 seeded trials and payloads of 1732 bytes, THE Symbols_Package SHALL decode the exact bytes with a Wilson_Lower_Bound of at least 0.90 (90%). [measured]
9. WHEN the Default_Cell is rendered at 4 pixels per module and degraded by the Typical_Profile at blur sigma 1 pixel for print use, with N = 200 seeded trials and payloads of 1732 bytes, THE Symbols_Package SHALL decode the exact bytes with a Wilson_Lower_Bound of at least 0.97 (97%). [measured]
10. THE measurement SHALL report the Harsh_Profile rates for the Default_Cell at 4 and 6 pixels per module and at blur sigma 0, 1 and 1.5 pixels, without a pass bar. [property]
11. THE minimum 4 pixels per module SHALL hold only while the capture blur sigma is at most 1 pixel (a quarter of a module), and THE test suite SHALL report the success rate at 3 pixels per module at blur sigma 1 pixel as a documented limit (measured 0.26 to 0.45 at N = 100), without a pass bar. [property]

### Requirement 7: Camera loop use and budgets

**User Story:** As the receiver, I want a reusable frame decoder with bounded cost, so that a live camera loop decodes frames without per-frame allocation or stalls.

#### Acceptance Criteria

1. WHEN `createFrameDecoder` receives a maximum frame size, THE Symbols_Package SHALL return a Promise that resolves with a Frame_Decoder after the reader .wasm initialisation, with working memory preallocated for that size and reused for each frame, and IF the initialisation fails, THEN THE Promise SHALL reject with a SymbolError with code UNSUPPORTED_ENVIRONMENT. [unit]
2. WHERE a `mode` option ('video' or 'photo') is given, THE Frame_Decoder SHALL apply it to each frame, and SHALL use 'video' when no `mode` is given. [unit]
3. THE Frame_Decoder SHALL use, in 'video' mode, exactly the reader options measured in the spike (QRCode format only, tryHarder, tryRotate, tryDownscale, one symbol, LocalAverage binarizer, no inversion), and, WHERE 'photo' mode is selected, THE Frame_Decoder SHALL add inverted-polarity detection and one retry with the GlobalHistogram binarizer on a miss. [unit]
4. IF a frame is larger than the maximum frame size given at creation, THEN THE Frame_Decoder SHALL throw a SymbolError with code INVALID_INPUT. [unit]
5. THE perf script SHALL report the decode time by the Perf_Method with the frame content, version and ECC_Level stated, and the median SHALL be at most 20 ms for a 1280x720 frame and at most 40 ms for a 1920x1080 frame (measured 4.4 ms and 8.9 ms, about 4.5 times headroom). [perf]
6. THE perf script SHALL report the encode time of a 1732-byte Packet at version 30, ECC_Level L by the Perf_Method, and the median SHALL be at most 5 ms (measured 0.40 ms). [perf]
7. THE perf script SHALL report the WebAssembly initialisation time (compile plus instantiate), measured once per page, and the time SHALL be at most 500 ms (measured about 23 ms in Node, including compile). [perf]
8. THE shipped reader .wasm asset SHALL be at most 1,000,000 bytes (measured 946,598 bytes). [unit]
9. WHILE the Frame_Decoder decodes camera frames in Chromium, THE app SHALL produce no single main-thread task longer than 50 ms attributable to decoding, measured with the long-tasks API or an equivalent. Whether decoding runs in a worker or on the main thread with a yield per frame is a design decision left to design.md. [Playwright]
10. THE Frame_Decoder SHALL run at most one decode in flight at a time. [unit]
11. WHILE a decode is in flight, THE Frame_Decoder SHALL drop each newly submitted frame and SHALL hold no pending frame. [unit]
12. THE camera loop SHALL sustain at least 5 decodes per second on mid-range hardware, which is at most 200 ms per decode; the slowdown of mid-range hardware against the Reference_Machine (assumed 5 to 10 times) is an assumption, not a measurement. [manual]

### Requirement 8: Errors

**User Story:** As the app developer, I want a closed set of typed errors and a non-throwing frame miss, so that the camera loop and UI handle failures predictably.

#### Acceptance Criteria

1. THE Symbols_Package SHALL export SYMBOL_ERROR_CODES as the closed set INVALID_INPUT, PACKET_TOO_LARGE, ENCODE_FAILED and UNSUPPORTED_ENVIRONMENT, and a SymbolError class carrying `{ code, message }`. [unit]
2. WHEN a frame contains no decodable symbol, THE Symbols_Package SHALL return Not_Found and SHALL NOT throw. [property]
3. WHEN a public function receives input of the wrong type, shape or range, THE Symbols_Package SHALL validate it with hand-written validators and throw a SymbolError with code INVALID_INPUT before any other processing. [property]
4. IF the Encoder fails for a reason other than input validation, THEN THE Symbols_Package SHALL throw a SymbolError with code ENCODE_FAILED. [unit]
5. IF a required platform feature is missing (for example a Canvas context method or WebAssembly), or the reader .wasm cannot be loaded or instantiated from the Wasm_Loader source, THEN THE Symbols_Package SHALL throw a SymbolError with code UNSUPPORTED_ENVIRONMENT. [unit]
6. FOR ALL thrown errors from public functions, THE error SHALL be a SymbolError whose code is in SYMBOL_ERROR_CODES. [property]

### Requirement 9: CSP and self-hosting

**User Story:** As the app owner, I want the package to run under one exact CSP with every asset served from the same origin, so that the app makes no network request to any other origin.

#### Acceptance Criteria

1. THE Symbols_Package SHALL work without eval, without `new Function` and without inline script or style. [Playwright]
2. THE app build SHALL bundle the reader .wasm and serve it from the same origin, never from a CDN, and THE Symbols_Package SHALL load it only through the Wasm_Loader source supplied by the app, overriding the zxing-wasm default jsDelivr location through the zxing-wasm module overrides (`locateFile` or `wasmBinary`). [Playwright]
3. THE app SHALL deliver the Strip_CSP as the HTTP response header `Content-Security-Policy` with exactly this single value: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. [unit]
4. THE Strip_CSP SHALL contain neither 'unsafe-eval' nor 'unsafe-inline'. The keyword 'wasm-unsafe-eval' permits compiling and instantiating WebAssembly only, and does not permit eval() or new Function(). [unit]
5. THE Strip_CSP SHALL leave img-src, worker-src and style-src unset, so that each falls back to 'self'. Any need for blob: or data: images or for a blob: worker SHALL be handled by a separate requirement change, not by this requirement. [unit]
6. THE app documentation SHALL state that frame-ancestors is ignored in a meta element and is therefore header-only, and that the host SHALL deliver the whole Strip_CSP as an HTTP header (the other directives would work in a meta element, but one header is the single source). [manual]
7. THE app SHALL keep the Strip_CSP string in one committed source, used by the Harness_Page server and by the documented host configuration, and a test SHALL assert that the served header equals the string in criterion 3 character for character. [unit]
8. WHEN the Harness_Page is served with the Strip_CSP header, THE Playwright wasm-load test SHALL run under exactly that policy and SHALL run encode, render, decode and a round trip, and observe zero securitypolicyviolation events and zero console errors. [Playwright]
9. WHEN the Harness_Page runs the round trip, THE test SHALL record every network request and assert that each request goes to the Harness_Page origin, that none goes to any other origin (including jsDelivr), that no script is loaded or dynamically imported from another origin, and that the .wasm is requested from the same origin. [Playwright]
10. WHEN the production Vite build of the app is served by the Harness_Page, THE Playwright build-and-load test SHALL assert that the URL imported from `@strip/symbols/wasm-url` resolves to a same-origin hashed .wasm asset that is not a `data:` URL, that the decoder loads it and decodes a symbol, and that `apps/strip/package.json` has no dependency on `zxing-wasm`. [Playwright]

### Requirement 10: Determinism and purity

**User Story:** As a maintainer, I want the symbol output to be a pure function of its inputs, so that results are reproducible across Node and Chromium.

#### Acceptance Criteria

1. THE src of the Symbols_Package SHALL contain no Math.random, Date.now or performance.now, enforced by ESLint and the existing purity script. [unit]
2. THE Symbols_Package SHALL compute the Symbol_Matrix as a pure function of (bytes, options). [property]
3. WHEN the same inputs are encoded by the same encoder in Node and in Chromium, THE Symbols_Package SHALL produce identical matrices (the Node output is compared with the Chromium output, with no stored reference files). [Playwright]
4. THE src of the Symbols_Package SHALL perform no DOM access, no fetch and no clock read, and the app SHALL pass the reader .wasm source through the Wasm_Loader. THE Wasm_URL_Module SHALL be the only src file that imports a `?url` module, and no other src file SHALL import the Wasm_URL_Module, as enforced by ESLint. [unit]

### Requirement 11: Dependencies

**User Story:** As the project owner, I want to approve every dependency before it is added, so that supply-chain risk stays under my control.

#### Acceptance Criteria

1. THE Symbols_Package SHALL use exactly two runtime dependencies: `qr` 0.7.2 (encoder only) and `zxing-wasm` 3.1.7 (reader build only), each pinned to its exact version. [unit]
2. THE user has approved the addition of `qr` 0.7.2 and `zxing-wasm` 3.1.7, so THE packages/symbols/package.json MAY list these two exact versions and no other runtime dependency. [unit]
3. WHEN a task adds a package entry to a package.json, THE same task SHALL add that package's row (name, exact version, license, reason) to docs/dependencies.md, and `tools/deps.test.ts` SHALL fail when a package.json entry has no row. The rows are not added by this spec. [unit]
4. THE Symbols_Package SHALL import `zxing-wasm` only through its reader entry, and SHALL NOT import or ship the writer or full builds. [unit]
5. THE Symbols_Package SHALL NOT import or call the decoder of `qr`. [unit]
6. THE Symbols_Package SHALL keep the Encoder and the Decoder_Backend behind internal interfaces in src, so that a backend can be replaced without changing the public API. [unit]
7. THE public barrel SHALL expose no type or value from any QR library. [unit]
8. THE apps/strip/package.json SHALL contain no dependency on `qr` or `zxing-wasm`, because the app obtains the .wasm URL from the Wasm_URL_Module. [unit]

### Requirement 12: Public API

**User Story:** As the app developer, I want one public barrel, so that I import only a stable surface.

#### Acceptance Criteria

1. THE Symbols_Package SHALL export from src/index.ts, as runtime symbols, exactly: encodeSymbol, renderToCanvas, renderToSvg, fitScale, decodeFrame, createFrameDecoder, SymbolError, SYMBOL_ERROR_CODES, QR_CAPACITY, QR_CAPACITY_BY_VERSION and QR_DEFAULTS. [unit]
2. THE Symbols_Package SHALL export from src/index.ts, as type-only symbols, the types Symbol_Matrix, ECC_Level, encode options, render options, decode options (including the Wasm_Loader source), decode result (including Not_Found), Frame_Decoder and SymbolErrorCode. [unit]
3. THE Symbols_Package SHALL expose the barrel through the package `exports` field entry `.`, and SHALL expose exactly one other entry, the subpath `./wasm-url` (importable as `@strip/symbols/wasm-url`), which exports the single value `readerWasmUrl` (a string). A test SHALL assert that the runtime export list of the barrel matches criterion 1 exactly, that `exports` has exactly these two entries, and that the barrel does not export `readerWasmUrl`. [unit]

### Requirement 13: Integration with the codec

**User Story:** As the app developer, I want proof that codec output survives the whole symbol path, so that a file sent as symbols is received intact.

#### Acceptance Criteria

1. WHEN the integration test encodes a file with the codec at packetSize 1732, converts each Packet with `encodeSymbol`, renders it with `renderToCanvas` and with `renderToSvg`, rasterizes it in Chromium, decodes it with `decodeFrame`, and feeds the decoded bytes to the codec decoder, THE codec decoder SHALL complete with file bytes identical to the input. [Playwright]
2. WHEN the same Packets are converted to an ImageData_Like in Node from the Symbol_Matrix, THE codec decoder SHALL complete with file bytes identical to the input. [unit]
3. THE integration test SHALL live outside src and MAY import runtime values from `@strip/codec`. [unit]

### Requirement 14: Defaults and capacity policy

**User Story:** As the app developer, I want measured defaults for screen and print, so that each symbol carries the most bytes that still decode reliably.

#### Acceptance Criteria

1. THE Symbols_Package SHALL export QR_DEFAULTS with a screen entry and a print entry, each holding version 30, ECC_Level L, packet size 1732 bytes and minimum 4 pixels per module. [unit]
2. THE Symbols_Package SHALL keep version (1..40) and ECC_Level (L, M, Q, H) selectable as overrides, with the capacity table exposed through QR_CAPACITY_BY_VERSION. [unit]
3. THE app SHALL pass the codec encode option packetSize (the total packet bytes) equal to the QR byte capacity of the chosen version and ECC_Level, which is 1732 for the defaults. THE Symbols_Package SHALL NOT change the codec default packet size. [unit]
4. FOR ALL versions 1..40, THE symbol width in modules including a 4-module Quiet_Zone SHALL equal 17 + 4 x version + 8, giving 580 pixels at version 30 and 740 pixels at version 40 for 4 pixels per module. [property]
5. WHEN `fitScale` receives a Symbol_Matrix with a 4-module Quiet_Zone and a square box of 70% of the short side of a camera frame, THE Symbols_Package SHALL return a scale of at least 4 for versions up to 25 at a 720p frame (box 504 pixels) and for versions up to 40 at a 1080p frame (box 756 pixels), and a scale below 4 for version 26 at a 720p frame. [unit]
6. THE documentation of QR_DEFAULTS SHALL state that a symbol should fill no more than about 70% of the short side of the camera frame. [manual]

### Requirement 15: Third-party notices

**User Story:** As the project owner, I want every shipped component's licence reproduced, so that the app meets the licence terms of its third-party code.

#### Acceptance Criteria

1. THE app SHALL ship THIRD_PARTY_NOTICES as a static committed file (not generated at build time) that lists each shipped component with its name, exact version, licence and the full licence text, and a unit test SHALL assert that the file names each of these components with its version and licence: `qr` 0.7.2 (MIT), `zxing-wasm` 3.1.7 (MIT), zxing-cpp (Apache-2.0) and the zxing-wasm C++ glue (Apache-2.0), the last two being contained in the reader .wasm. [unit]
2. THE THIRD_PARTY_NOTICES file SHALL contain the full Apache-2.0 licence text (asserted by the same unit test), because the `zxing-wasm` npm package ships only the MIT LICENSE file. [unit]
3. THE implementation task SHALL verify whether zxing-cpp has a NOTICE file upstream at the version embedded in the reader .wasm, and, IF such a NOTICE file exists, THEN THE THIRD_PARTY_NOTICES file SHALL reproduce its contents. The result of the verification SHALL be recorded in the task notes. [manual]
4. THE THIRD_PARTY_NOTICES file SHALL NOT list the BSD-3 zint code, because zint is only in the writer and full builds, which are not shipped (see Requirement 11, criterion 4). [unit]
5. THE app SHALL serve THIRD_PARTY_NOTICES from the same origin and SHALL link to it from the app. [Playwright]

## Correctness properties to be numbered in design

- Round trip of any byte array of 1..Capacity bytes for each ECC_Level: the encoded bytes round-trip through the pinned zxing-wasm decoder (encode, render, decode equals input).
- Determinism of the Symbol_Matrix for identical bytes and options.
- Matrix invariants (finder, timing, format, version information, size and length) hold for random inputs.
- Render, rasterize, decode equals the input for canvas and for SVG.
- Rotation at any of 360 degrees and occlusion within the ECC capacity decode, reported as informational unless a cell is selected for assertion by Requirement 6, criterion 6.
- Not_Found for blank and noise frames, and decoding never throws for them.
- Capacity boundary: Capacity bytes accepted and Capacity+1 rejected with PACKET_TOO_LARGE, for each ECC_Level, and the same at each version when a version option is given, using the ISO_Capacity_Table, which also equals QR_CAPACITY_BY_VERSION.
- Node and Chromium produce identical matrices from the same encoder and inputs.
- Every codec packet size from the codec spec that fits an ECC_Level is accepted at that level, including 1732 at version 30 L.
- Every SVG output is free of script, style, event handlers and external references.
- `fitScale` returns the largest integer scale that fits the target box.
- Symbol width in modules equals 17 + 4 x version + 8 for every version 1..40.
- Default_Cell success under the Typical_Profile at blur sigma 1 pixel has a Wilson_Lower_Bound of at least 0.90 for screen and at least 0.97 for print (N = 200).
- The Frame_Decoder never has more than one decode in flight and never holds more than one pending frame.
- The app CSP header equals the exact string in Requirement 9, criterion 3.
- No network request is made other than the same-origin load of the reader .wasm.

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
- The `qr` decoder, and the zxing-wasm writer and full builds.
- Any CDN or remote load of the .wasm.
- img-src, worker-src or style-src exceptions such as blob: or data:.
- A pass bar on the Harsh_Profile.
- Raising the default version to 40 (resolved, Resolved questions 6; the real-device check may move it).
- Golden matrix files and any Python or other non-JavaScript reference implementation.
- Generating THIRD_PARTY_NOTICES at build time.

## Resolved questions

1. **Library pair.**
   - Decision: `qr` (paulmillr) 0.7.2, exact pin, encoder only, encodes. `zxing-wasm` 3.1.7, exact pin, reader build only, decodes. The user decided on zxing-wasm as the decoder after the spike showed that `qr` fails the decision rule as a decoder.
   - Evidence (`docs/spikes/symbols-decoder.md`): the decision rule required at least 0.95 at the defaults and within 5 points of zxing-wasm. In grid 1 (Harsh_Profile, N = 200 per cell) no `qr` cell reaches 0.95 (best 0.87, v10 M, 6 px/module, blur 0). At v20, v30 and v40 with 6 px/module `qr` trails zxing-wasm by 12 to 61 points. In the diagnostics, `qr` fails mainly under rotation and perspective (at v40, perspective alone dropped `qr` to 0.05 while zxing-wasm stayed at 1.00, N = 20), and raising its effort changed results by at most 4 points. Speed does not separate them (3 to 11 ms per frame).
   - Rationale: a phone shot of a screen or a print contains rotation and perspective, so decoder strength under those matters most. `qr` stays as the encoder because it passed the binary-safety test and has no CSP implication.
   - Evaluation history (compact). Chosen rows are marked.

     | package | role | version | licence | CSP implication |
     |---|---|---|---|---|
     | qr (paulmillr) | encode (CHOSEN, encoder only), decode (rejected) | 0.7.2 | MIT OR Apache-2.0 | none (pure JS) |
     | uqr | encode | 0.1.3 | MIT | none; binary safety unconfirmed |
     | qrcode-generator | encode | 2.0.4 | MIT | none |
     | qrcode (node-qrcode) | encode | 1.5.4 | MIT | none |
     | jsQR | decode | 1.4.0 | Apache-2.0 | none; unmaintained, slow on large frames |
     | @zxing/library | decode | 0.23.0 | Apache-2.0 | none; 11.9 MB unpacked |
     | qr-scanner (nimiq) | decode | 1.4.2 | MIT | worker-src blob: likely needed |
     | zxing-wasm | decode, reader build (CHOSEN) | 3.1.7 | MIT (zxing-cpp Apache-2.0, zint BSD-3-Clause in writer and full builds only) | 'wasm-unsafe-eval'; the .wasm (946,598 B reader) is fetched from jsDelivr by default and must be self-hosted |
     | barcode-detector | decode (polyfill over zxing-wasm) | 3.2.4 | MIT | same as zxing-wasm |
     | rxing-wasm | decode, encode | 0.5.9 | Apache-2.0 | 'wasm-unsafe-eval' |
     | @undecaf/zbar-wasm | decode | 0.11.0 | LGPL-2.1+ | 'wasm-unsafe-eval'; copyleft needs review |

   - The row for each of `qr` and `zxing-wasm` is added to docs/dependencies.md in the task that adds that package (Resolved questions 7, decision B).

2. **Binary safety.**
   - Decision: bytes map to `qr` through Latin-1 (`String.fromCharCode` per byte), with encoding forced to `byte` and `textEncoder` mapping character codes back to bytes. The decode side takes the raw bytes from zxing-wasm (`result.bytes`), so no text decoding is involved.
   - Evidence: the spike round-tripped all 256 byte values, 20 random 2953-byte payloads at v40 L, random full-capacity payloads at v10 L, v20 L, v30 L, v40 M and v40 L, all-zero and all-0xFF 2953-byte payloads, and 30 real codec packets (sizes 2953, 1000 and 500). The only two failures were over-capacity inputs that correctly raised a capacity error (2954 bytes at v40 L, a deliberate case; 256 bytes at v10 M, whose capacity is 213, a test mistake).
   - Rationale: an identity byte-to-character mapping avoids every UTF-8 conversion, and raw bytes on the decode side avoid text decoding altogether.

3. **Thresholds and budgets.**
   - Decision: gated thresholds are decode success under the Typical_Profile at the Default_Cell and blur sigma 1 pixel, N = 200, judged by the Wilson_Lower_Bound: screen at least 0.90, print at least 0.97. The Harsh_Profile is informational. Minimum 4 pixels per module holds only at blur sigma of at most 1 pixel. Budgets on the Reference_Machine: decode median at most 20 ms (1280x720) and 40 ms (1920x1080); encode median at most 5 ms at v30 L; WebAssembly initialisation at most 500 ms; reader .wasm at most 1,000,000 bytes; no single main-thread task over 50 ms attributable to decoding.
   - Evidence: grid 2 (Typical_Profile, zxing-wasm, N = 200 per cell, v10, 15, 20, 25, 30 x L, M, Q x 4, 5, 6 px/module x blur 0 and 1) gave 200/200 in all 90 cells, a Wilson lower bound of about 0.98. The probe (N = 100) showed 3 px/module fails at blur sigma 1 (0.26 to 0.45) and 4 px/module gives 1.00 at v25, v30 and v40. Grid 1 for zxing-wasm: best cell v20 L 6 px/module 0.99 at blur 0 and 0.94 at blur 1, v40 6 px/module 0.96 and 0.81, and 0.34 or less at 3 px/module and at blur 1.5. Speed: decode 3.4 to 4.4 ms per 1280x720 frame and 8.4 to 8.9 ms per 1920x1080 frame, first call with wasm compile and init about 23 ms in Node, `qr` encode 0.40 ms at v30 L; the reader .wasm is 946,598 bytes.
   - Rationale: the budgets give about 4.5 times headroom over the measured medians, which keeps a mid-range phone within 200 ms per decode (5 decodes per second) if it is 5 to 10 times slower (an assumption). The limit is blur relative to module size, not version.

4. **ECC and packet-size policy.**
   - Decision: screen and print both default to version 30, ECC_Level L, packet size 1732 bytes, minimum 4 pixels per module. Version 1..40 and ECC_Level L, M, Q, H stay selectable, and the capacity table is exposed. The codec default packet size (2953) is not changed. The app passes packetSize equal to the QR byte capacity.
   - Evidence: the selection rule was the largest payload bytes per symbol among cells with success of at least 0.90 at blur 1 for screen and at least 0.97 for print. Every cell of the saturated grid 2 qualifies, so the largest capacity in the grid wins: v30 L 4 px/module, measured 1.000 (N = 200). Byte capacities: v30 L 1732, M 1370, Q 982, H 742; v40 L 2953, M 2331, Q 1663, H 1273. Symbol width is 17 + 4 x version + 8 modules with a 4-module Quiet_Zone: 580 px at v30 and 740 px at v40 for 4 px/module. At about 70% of the short side of the frame, 720p holds up to v25 and 1080p up to v40.
   - Rationale: capacity per symbol is maximised where the measurements show no loss. Higher ECC levels remain available for poor cameras at the cost of capacity.

5. **CSP posture.**
   - Decision: the Strip_CSP in Requirement 9, criterion 3, delivered as an HTTP header, with 'wasm-unsafe-eval' in script-src, no 'unsafe-eval' and no 'unsafe-inline'. The reader .wasm is bundled and served from the same origin, with no CDN fetch.
   - Evidence: the spike found zxing-wasm needs 'wasm-unsafe-eval', and that its default is a jsDelivr fetch that must be overridden with `locateFile` or `wasmBinary`. A grep of the shipped glue found no `new Function`.
   - Rationale: 'wasm-unsafe-eval' permits WebAssembly compilation and instantiation only, not eval or `new Function`. frame-ancestors is ignored in a meta element, so the host must send the policy as a header.

6. **Default version (former open question a).**
   - Decision: the default stays version 30, ECC_Level L, 1732 bytes, 4 pixels per module, for both screen and print.
   - Reasoning: the synthetic grid is saturated (all 90 cells at 200/200, upper limit v30), so it does not show that a larger default decodes more reliably on real devices, and a bigger default is not justified yet. The default stays overridable (Requirement 1, criterion 12; Requirement 14, criterion 2), and the real-device check (Requirement 6, criterion 7) can move it.

7. **User decisions A to F.**
   - A. Default stays v30 / ECC L / 1732 bytes / 4 px per module for screen and print (see 6).
   - B. Dependencies approved: `qr` 0.7.2 and `zxing-wasm` 3.1.7, exact-pinned. The docs/dependencies.md row for each package is added in the task that adds that package, not before and not in a separate docs task, and `tools/deps.test.ts` enforces it (Requirement 11).
   - C. No Python golden matrices. The independent oracle is zxing-wasm decoding what `qr` encodes (Requirement 1, criteria 7 and 8), plus the ISO_Capacity_Table checked against QR_CAPACITY_BY_VERSION and cross-checked by encoding capacity and capacity + 1 bytes at every version and ECC_Level (Requirement 1, criterion 14). Requirement 2, criterion 4 stays as the structural check. Node-vs-Chromium parity compares Node output with Chromium output of the same encoder (Requirement 10, criterion 3).
   - D. The `?url` import of the reader .wasm lives in the Wasm_URL_Module inside the Symbols_Package, exposed as the only subpath export `@strip/symbols/wasm-url` (Requirement 12, criterion 3). The app has no direct `zxing-wasm` dependency, proved by a build-and-load test (Requirement 9, criterion 10). Only if that test fails does the app get a direct dependency with the identical exact pin, recorded in the task.
   - E. THIRD_PARTY_NOTICES is a static committed file with a unit test (Requirement 15, criteria 1 and 2).
   - F. Five requirement changes applied: Requirement 7 criterion 11 (no pending frame); Requirement 7 criterion 1 and Requirement 5 criterion 7 (`createFrameDecoder` returns a Promise); Requirement 7 criteria 2 and 3 (`mode` option); Requirement 6 criteria 1, 8 and 9 tagged [measured]; Requirement 9 criterion 1 and criterion 9 (remote dynamic import folded into the request-log assertion).

## Open questions

Each item below carries a recommended default. The recommended defaults are NOT decisions.

- (a) **Uncovered capture defects.** Moiré, glare, motion blur, rolling shutter and print defects are not covered by the synthetic profile, so a real-device test is the only check. Recommended default (NOT a decision): run the manual check of Requirement 6, criterion 7 before any release, and do not read 1.000 as a guarantee on phones.
- (b) **zxing-cpp NOTICE file.** Whether zxing-cpp ships a NOTICE file to reproduce. Recommended default (NOT a decision): verify during the implementation task (Requirement 15, criterion 3) and reproduce it if it exists.
- (c) **Worker or main thread for decode.** This is a design decision for design.md. Recommended default (NOT a decision): decode in a same-origin module worker file (not a blob: worker, which the Strip_CSP blocks), and fall back to a yield per frame only if the worker fails the 50 ms main-thread criterion in Requirement 7, criterion 9 or cannot run under the Strip_CSP.
- (d) **Mid-range slowdown.** The 5 to 10 times slowdown of mid-range phones against the Reference_Machine is an assumption, not a measurement. Recommended default (NOT a decision): keep the 4.5 times headroom in the budgets and measure on one real mid-range phone in the manual check.
