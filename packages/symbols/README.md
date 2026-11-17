`@strip/symbols` turns one codec packet into a QR code (canvas or SVG) and reads it back from camera pixels, entirely in the browser with no server and no network use except one same-origin WebAssembly file.

It sits between `@strip/codec` and the app. It imports codec types only. Packet production, loss recovery and framing are the codec's job.

## Usage

```ts
import { createFrameDecoder, encodeSymbol, fitScale, QR_DEFAULTS, renderToCanvas, renderToSvg } from "@strip/symbols";
import { wasmSource } from "./symbols-wasm"; // see "wasm-url subpath" below

// Send: one packet (1..2953 bytes) -> a symbol matrix -> pixels or SVG.
const matrix = encodeSymbol(packet, { ecc: "L", version: 30 }); // version is optional: the smallest that fits
renderToCanvas(ctx, matrix, { ppm: 4 });                       // integer pixels per module, crisp edges
const svg = renderToSvg(matrix, { ppm: 1, mm: 70 });            // script-free SVG text, sized in millimetres

// Receive: a camera loop. One decode in flight; frames that arrive meanwhile resolve { kind: "dropped" }.
const decoder = await createFrameDecoder({ wasm: wasmSource, maxWidth: 1920, maxHeight: 1080 });
const outcome = await decoder.submit({ width, height, data }); // data: RGBA Uint8ClampedArray
if (outcome.kind === "found") codecDecoder.push(outcome.bytes);
```

Outcomes: `found` (exact packet bytes, plus version, ECC level and corners when the reader reports them), `found_many` (see below), `not_found`, `not_strip_packet` (payload over 2953 bytes, single-symbol mode only) and `dropped`. Errors are `SymbolError` with a code from the closed set `INVALID_INPUT`, `PACKET_TOO_LARGE`, `ENCODE_FAILED`, `UNSUPPORTED_ENVIRONMENT`.

## Several symbols in one image: `maxSymbols`

A photo or scan of a printed page holds many symbols (nine in the SendPaper layout). Pass `maxSymbols` (an integer 1 to 16, default 1) to `decodeFrame` or `createFrameDecoder`:

```ts
const decoder = await createFrameDecoder({ wasm: wasmSource, maxWidth: 4000, maxHeight: 4000, maxSymbols: 9, mode: "photo" });
const outcome = await decoder.submit(photoRgba);
if (outcome.kind === "found_many") for (const s of outcome.symbols) codecDecoder.push(s.bytes);
```

- With the default `maxSymbols` 1 nothing changes: the outcome is `found` for the first symbol the reader returns.
- With `maxSymbols` above 1 the outcome is `found_many`: `symbols` is a list of `FoundSymbol` (`bytes`, and `version`, `ecc`, `corners` when reported) and `skipped` counts valid symbols whose payload is longer than 2953 bytes (not Strip packets). No symbol at all gives `not_found`. Only over-long symbols give `found_many` with an empty `symbols` and `skipped` of at least 1. `not_strip_packet` appears only with `maxSymbols` 1.
- The list is in the reader's order, which is unspecified. Symbols are identified by their content, not their place. Duplicates are not removed (the codec ignores duplicate packets). Each `bytes` owns its own buffer.
- `FoundSymbol` is a type-only export; the barrel's runtime export list stays the 11 names above.

Public runtime exports: `encodeSymbol`, `renderToCanvas`, `renderToSvg`, `fitScale`, `decodeFrame`, `createFrameDecoder`, `SymbolError`, `SYMBOL_ERROR_CODES`, `QR_CAPACITY`, `QR_CAPACITY_BY_VERSION`, `QR_DEFAULTS`. The decoder has two modes: `video` (the default, the options every budget below was measured with) and `photo` (adds polarity inversion and one retry with a different binarizer; its benefit is not gated).

## Defaults: `QR_DEFAULTS`

Screen and print share one cell: **version 30, ECC L, 1732-byte packet, at least 4 pixels per module**. Pass `packetSize: 1732` to the codec encoder. The 4 pixels per module hold only while the capture blur is at most 1 pixel, a quarter of a module. A symbol should fill no more than about 70% of the short side of the camera frame. `fitScale` computes the largest integer scale that fits a box. A symbol is `25 + 4 x version` modules wide including a 4-module quiet zone: 145 modules (580 px at 4 px/module) for version 30 and 185 (740 px) for version 40. At 4 px/module a 720p frame holds up to version 25 and a 1080p frame up to version 40 at the 70% size.

Version and ECC level can be overridden. The defaults come from a synthetic experiment whose grid was saturated, so they are the safe end of what was measured, not an optimum. The manual check in [docs/device-test.md](../../docs/device-test.md) can move them.

## Byte mapping

`qr` takes a string. Every packet byte becomes the character with the same code (Latin-1, `String.fromCharCode`), the encoder is forced to byte mode, and a custom `textEncoder` maps each character code back to one byte, so no byte is changed by UTF-8 text encoding. The decoder side reads the raw `bytes` of the zxing-wasm result and never reads its text. Checked on all 256 byte values, random packets up to 2953 bytes and 30 real codec packets. `qr` rejects a zero border, so the encoder asks for one module of border and removes it; the quiet zone is a render option (default 4 modules).

## CSP

The app runs under one exact policy, kept in `apps/strip/src/csp.ts`:

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

No `'unsafe-eval'`, no `'unsafe-inline'`. `worker-src 'self'` is explicit: the decode worker is a same-origin file, not a `blob:` worker. `'wasm-unsafe-eval'` allows compiling and instantiating WebAssembly only, not `eval` or `new Function`. The host must deliver the policy as an HTTP response header on every response, including the worker script and the `.wasm`, because `frame-ancestors` is ignored in a `<meta>` element and a worker is governed by the policy of its own response. The `.wasm` must be served as `application/wasm`; otherwise the streaming compile falls back with a console warning.

## wasm-url subpath

The reader `.wasm` (946,598 bytes, from `zxing-wasm` 3.1.7, reader build only) is bundled by the app build and served from the same origin. Vite resolves it from this package, so the app has no `zxing-wasm` dependency:

```ts
import { readerWasmUrl } from "@strip/symbols/wasm-url"; // the only subpath export; Vite-only, never in the barrel
export const wasmSource = { kind: "url", url: readerWasmUrl } as const;
```

No code path fetches from a CDN. `createFrameDecoder` and `decodeFrame` throw `INVALID_INPUT` when no source is given, and `UNSUPPORTED_ENVIRONMENT` when the module cannot be loaded (for example under a policy without `'wasm-unsafe-eval'`).

## Measured claims

All numbers come from synthetic camera-like degradation (supersampled projective warp, blur, contrast, gradient, noise) of `qr` symbols, decoded by the pinned reader, with seeded randomness. No real phone has been used yet (see the device check). Run `pnpm test:measured` and `pnpm perf` in this package to reproduce.

| Claim | N | Method | Result |
|---|---|---|---|
| Default cell, Typical profile (rotation up to 5 degrees, perspective up to 4%, 70% contrast, 4% noise, mild gradient), 4 px/module, blur 1 px | 200 | random 1732-byte payloads, fresh seeds | 200/200, Wilson 95% lower bound 0.981. Asserted: at least 0.90 for screen and 0.97 for print |
| Clean symbols, every version 1..40 at every ECC level, 4 and 8 px/module | 320 | full-capacity payloads | 320/320 |
| 3 px/module at blur 1 px, Typical profile | 100 | as above | 0.38 (the documented limit, not asserted) |
| Harsh profile (rotation up to 10 degrees, perspective up to 8%, 50% contrast, 8% noise), 4 px/module, blur 0 / 1 / 1.5 px | 200 | as above | 0.85 / 0.235 / 0.00. Informational |
| Same, 6 px/module | 200 | as above | 0.955 / 0.87 / 0.28. Informational |
| Page photo: 12 MP (3000x4000) synthetic photo of an A4 page, 3x3 grid of v30 L symbols, about 5.0 px/module, Typical profile with rotation up to 10 degrees, perspective up to 4%, blur 1 px, `maxSymbols` 9 | 100 pages | video-mode reader options, a symbol counts only if its bytes equal one of the nine payloads | 900/900 symbols, 100/100 pages with at least 8 of 9 (Wilson lower bound 0.963), 100 pages with 9 of 9, decode median 77 ms (p95 81). Asserted: lower bound at least 0.90 |
| Page photo at 4.1 px/module (page fills 75% of the photo height) | 52 pages | as above | 468/468 symbols, 52/52 pages with at least 8 of 9 (Wilson lower bound 0.931), decode median 82 ms. Informational |
| Decode of the 12 MP page photo with `maxSymbols` 9 | 20 | median after 3 warm-ups, Node 25.9, Apple M2 Pro | 70.3 ms (budget 250 ms) |
| Decode, 1280x720 frame (v20 L, 4 px/module) and 1920x1080 frame (v30 L, 5 px/module) | 20 | median after 3 warm-ups, Node 25.9, Apple M2 Pro | 3.6 ms and 7.8 to 8.1 ms (budgets 20 and 40 ms) |
| Encode 1732 bytes at v30 L | 20 | same | 0.6 to 1.0 ms (budget 5 ms) |
| Reader init in Chromium, then first decode, fresh browser process each time | 5 | median, real CSP, no cache | 6.4 ms and 11.4 ms |

The synthetic page-photo generator reproduces the multi-symbol spike (899/900 symbols, 100/100 pages, median 78 ms; see [docs/spikes/symbols-multi.md](../../docs/spikes/symbols-multi.md)). It is synthetic: no real photo of a printed page has been decoded, the photo-mode path with several symbols is not gated, a 1080p camera frame of a page is not measured, and the timings are for a desktop CPU. The app spec dependency D2 (multi-symbol decoding) is satisfied by this section.

The decoder was chosen after a spike (see [docs/spikes/symbols-decoder.md](../../docs/spikes/symbols-decoder.md)): `qr`'s own decoder failed on rotation and perspective, so `zxing-wasm` reads and `qr` only writes. These are measurements with a stated sample size and method, not guarantees.

## Prior art

Sending files as a stream of animated QR codes, and putting data on paper, are both old and well covered. This package claims nothing new in the transport. Related projects, with what they are as far as we know:

- **Decimen Optical Transfer**: a browser-based tool that shows a file as a stream of fountain-coded animated QR codes and reads it with another device's camera. Closest to what Strip does on screen.
- **TXQR**: protocol and tools that send data as animated QR codes, using fountain codes so frames can be missed.
- **cimbar**: a high-density colour 2D barcode with its own error correction, used with fountain-coded file transfer from a screen.
- **PaperBack**: prints a file on paper as a dense dot pattern with redundancy and reads it back from a scan.
- **qr-backup**: backs up files on paper as QR codes.

The Cauzin Softstrip (1985) is the historical model for data strips on paper. The pieces here are existing parts: a standard QR encoder, a standard reader, and a fountain codec.
