# Symbols decoder spike

Date: 2026-11. Status: complete. Decision: zxing-wasm decodes, qr encodes (encoder only).

This spike chose the QR libraries for `@strip/symbols`. It ran in a scratch directory outside the repo. No dependency was added to the repo and nothing was added to `docs/dependencies.md`. The scratch scripts are not committed. The seeds and parameters below are enough to reproduce the runs.

Candidates:

- `qr` (paulmillr) 0.7.2: pure JS, MIT OR Apache-2.0, encoder and decoder.
- `zxing-wasm` 3.1.7 reader: WASM (reader .wasm 946,598 bytes), MIT with Apache-2.0 and BSD-3 inside.

## Method

### Binary safety (qr encoder)

`qr` takes strings. The lossless mapping is Latin-1: each byte becomes the character with the same code (`String.fromCharCode`), encoding is forced to `byte`, and `textEncoder` maps characters back to bytes (`charCodeAt`). On decode, `textDecoder` maps bytes to characters and the caller maps them back to bytes.

51 cases, 49 round-trip exactly:

- All 256 byte values.
- 20 random 2953-byte payloads at v40 L.
- Random payloads at full capacity for v10 L, v20 L, v30 L, v40 M and v40 L (5 each).
- All-zero and all-0xFF 2953-byte payloads, and a UTF-8-looking sequence.
- 30 real codec packets (packet sizes 2953, 1000 and 500; 10 each).
- The two failures are deliberate over-capacity cases (2954 bytes, and 256 bytes at v10 M, whose capacity is 213). Both fail with a capacity error, as they should.

### Synthetic camera degradation

Each trial renders the module matrix with a 4-module quiet zone onto a grey frame, and applies the steps below. The frame is 1.2 times the symbol size.

1. Rotation, uniform in the stated range.
2. Perspective foreshortening: a projective warp with the stated maximum gradient per axis.
3. 2x2 supersampling for anti-aliasing.
4. Gaussian blur of the stated sigma, in capture pixels.
5. Contrast compression to the stated fraction of the range (50% maps black and white to 64 and 191).
6. Brightness gradient, linear across the frame at a random angle.
7. Gaussian noise with sd equal to the stated fraction of 255.
8. Clamp and round to 8 bits.

Each trial's payload is random bytes filling the version's capacity at that ECC level, so every cell is at maximum density. The seed is a hash of the cell parameters and the trial index. Success means the decoded bytes equal the payload exactly. Both decoders read the same image.

Decoder settings: `qr` with default options (`effort` 1, `timeLimit` one 60 fps frame); zxing-wasm `readBarcodes` with `formats: ['QRCode']`, `tryHarder`, `tryRotate`, `tryDownscale`, `binarizer: 'LocalAverage'`, one symbol, with the .wasm loaded from disk.

### Stress profile: deliberately harsh worst case

The first grid applies all degradations at once in every cell: rotation up to ±10°, perspective up to ±8%, 50% contrast, 8% noise (sd 20 levels), and a brightness gradient of about ±16 levels. This is a worst-case profile, harsher than a typical phone shot. It was chosen to separate the decoders, not to predict typical success rates. The typical-phone profile is in the second grid, further down.

## Grid 1: harsh profile (N = 200 per cell)

Cells show success rate as `qr / zxing-wasm`.

| Version | ECC | px/module | blur 0 | blur 1 | blur 1.5 |
|---|---|---|---|---|---|
| 10 | L | 3 | 0.34 / 0.83 | 0.00 / 0.00 | 0.00 / 0.00 |
| 10 | L | 4 | 0.55 / 0.91 | 0.01 / 0.24 | 0.00 / 0.00 |
| 10 | L | 6 | 0.86 / 0.76 | 0.60 / 0.59 | 0.04 / 0.03 |
| 10 | M | 3 | 0.36 / 0.83 | 0.00 / 0.00 | 0.00 / 0.00 |
| 10 | M | 4 | 0.54 / 0.90 | 0.01 / 0.30 | 0.00 / 0.00 |
| 10 | M | 6 | 0.87 / 0.78 | 0.71 / 0.63 | 0.14 / 0.03 |
| 20 | L | 3 | 0.38 / 0.81 | 0.00 / 0.00 | 0.00 / 0.00 |
| 20 | L | 4 | 0.59 / 0.89 | 0.01 / 0.27 | 0.00 / 0.00 |
| 20 | L | 6 | 0.83 / 0.99 | 0.60 / 0.94 | 0.04 / 0.33 |
| 20 | M | 3 | 0.38 / 0.76 | 0.00 / 0.00 | 0.00 / 0.00 |
| 20 | M | 4 | 0.60 / 0.89 | 0.01 / 0.31 | 0.00 / 0.00 |
| 20 | M | 6 | 0.83 / 0.99 | 0.62 / 0.91 | 0.16 / 0.33 |
| 30 | L | 3 | 0.33 / 0.81 | 0.00 / 0.00 | 0.00 / 0.00 |
| 30 | L | 4 | 0.53 / 0.91 | 0.01 / 0.26 | 0.00 / 0.00 |
| 30 | L | 6 | 0.64 / 0.96 | 0.50 / 0.93 | 0.05 / 0.28 |
| 30 | M | 3 | 0.38 / 0.78 | 0.00 / 0.00 | 0.00 / 0.00 |
| 30 | M | 4 | 0.52 / 0.87 | 0.01 / 0.32 | 0.00 / 0.00 |
| 30 | M | 6 | 0.61 / 0.99 | 0.50 / 0.91 | 0.10 / 0.34 |
| 40 | L | 3 | 0.20 / 0.78 | 0.00 / 0.00 | 0.00 / 0.00 |
| 40 | L | 4 | 0.36 / 0.85 | 0.01 / 0.25 | 0.00 / 0.00 |
| 40 | L | 6 | 0.35 / 0.96 | 0.26 / 0.81 | 0.01 / 0.26 |
| 40 | M | 3 | 0.20 / 0.75 | 0.00 / 0.00 | 0.00 / 0.00 |
| 40 | M | 4 | 0.39 / 0.83 | 0.01 / 0.25 | 0.00 / 0.00 |
| 40 | M | 6 | 0.47 / 0.95 | 0.34 / 0.86 | 0.04 / 0.30 |

Reading:

- No `qr` cell reaches 0.95. Its best is 0.87 (v10 M, 6 px/module, blur 0).
- At v20, v30 and v40 with 6 px/module, `qr` trails zxing-wasm by 12 to 61 points at every blur level.
- At v10 with 6 px/module, `qr` matches or beats zxing-wasm. Both decoders are poor in that cell.
- v40 is poor for both decoders under this stress.

## Diagnostics: where each decoder fails

v20 L, 6 px/module, N = 100 per row. Cells show `qr / qr with effort 5 and timeLimit 2000 / zxing-wasm`.

| Condition | blur 0 | blur 1 |
|---|---|---|
| All degradations | .90 / .90 / .99 | .66 / .66 / .91 |
| No perspective skew | .97 / .97 / 1.00 | .88 / .88 / .98 |
| Skew and rotation only | .79 / .83 / 1.00 | .81 / .84 / 1.00 |
| Noise and low contrast only | 1.00 / 1.00 / 1.00 | .97 / .97 / .81 |

- `qr` fails mainly on rotation and perspective, and the weakness grows with version. At v40, 6 px/module, perspective alone dropped `qr` to 0.05 while zxing-wasm stayed at 1.00 (N = 20).
- Raising `effort` and `timeLimit` made little difference (up to 4 points).
- zxing-wasm is weaker under noise at low contrast. This is why `qr` wins the last row.

## Speed

Measured in Node 25.9 on an Apple M2 Pro (a fast desktop CPU, not mid-range hardware). A synthetic frame holds one degraded symbol (blur 1, rotation, skew, noise, contrast) filling about 80% of the frame height. Each row is the median of 20 frames after 3 warm-ups. The "ok" columns count correct decodes in the 20 timed frames. A failed decode counts for its time, so a fast failure lowers the median.

| Frame | Version | px/module | qr median (p95) ms | qr ok | zxing-wasm median (p95) ms | zxing ok |
|---|---|---|---|---|---|---|
| 1280x720 | 10 L | 8 | 3.3 (14.7) | 15/20 | 4.4 (6.1) | 20/20 |
| 1280x720 | 15 L | 6 | 3.5 (7.9) | 17/20 | 4.1 (5.3) | 18/20 |
| 1280x720 | 20 L | 5 | 4.8 (9.3) | 6/20 | 4.1 (4.7) | 11/20 |
| 1280x720 | 30 L | 3 | 4.1 (7.2) | 0/20 | 3.4 (4) | 0/20 |
| 1280x720 | 40 L | 3 | 5 (6.8) | 0/20 | 4 (4.6) | 0/20 |
| 1920x1080 | 10 L | 13 | 3.9 (13.3) | 18/20 | 8.6 (9.9) | 20/20 |
| 1920x1080 | 15 L | 10 | 4.5 (16.2) | 18/20 | 8.9 (10.6) | 20/20 |
| 1920x1080 | 20 L | 8 | 8.1 (26.3) | 18/20 | 8.9 (10.1) | 20/20 |
| 1920x1080 | 30 L | 5 | 10.9 (13.4) | 4/20 | 8.9 (11.1) | 9/20 |
| 1920x1080 | 40 L | 4 | 10.1 (12.2) | 0/20 | 8.4 (10.9) | 2/20 |

- Both decoders take about 3 to 11 ms per frame on this machine. Speed does not separate them.
- The camera loop needs at least 5 decodes per second, so a decode must take under about 200 ms. A phone 5 to 10 times slower than this machine would still decode in 50 to 110 ms. That multiplier is an assumption, not a measurement. The design must still keep the decode off the main thread or drop frames while a decode is in flight.

## Decision

zxing-wasm decodes. `qr` encodes (encoder only).

- Decision rule: `qr` passes if its success is at least 0.95 at the recommended defaults and within 5 points of zxing-wasm on every cell at those defaults. `qr` as a decoder fails it: no cell reaches 0.95, and it trails by up to 61 points where zxing-wasm succeeds.
- The weakness is rotation and perspective, which is what a phone shot of a screen or a printed strip contains. Speed is not a differentiator.
- `qr` as an encoder passes the binary-safety test and has no CSP implication. It stays as the encoder.
- CSP: zxing-wasm needs `'wasm-unsafe-eval'` in `script-src`. That token permits WebAssembly compilation only, not `eval` or `new Function`. The .wasm must be self-hosted, and the default CDN fetch must not be used.
