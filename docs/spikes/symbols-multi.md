# Multi-symbol decoding spike

Date: 2026-11. Status: complete. Decision: use zxing-wasm's own multi-symbol read (`maxNumberOfSymbols`) in `@strip/symbols`. Tiling is not needed.

Question: can the pinned reader (zxing-wasm 3.1.7, reader build) read every symbol of a photo of a printed page, so that the receiver can take page photos and scans? The symbols spec decodes one symbol per frame (`maxNumberOfSymbols: 1`).

The scratch scripts are not in the repository (`page.mjs`, `multi-run.mjs`, `sum.mjs` in a scratch directory). The parameters and seeds below are enough to reproduce.

## Method

- **Page.** A4 portrait, white paper, a 3 x 3 grid of version 30, ECC L symbols (the SendPaper board layout). Each symbol carries 1732 random bytes, so every page has nine different payloads. A symbol is 145 modules wide including the 4-module quiet zone. Module size 0.4048 mm (58.7 mm per symbol), the board grid. Grid origin 28 mm from the top. Encoded by `qr` with the Latin-1 mapping of the symbols package.
- **Photo.** 3000 x 4000 pixels (12 MP), portrait, the page filling a stated fraction of the photo height, dark table around it. Each output pixel is inverse-mapped into page coordinates with 2 x 2 supersampling.
- **Degradation.** Typical-phone profile as in the decoder spike: blur sigma 1 px, 70% contrast, 4% noise, mild brightness gradient. Rotation up to +-10 degrees (the typical profile has +-5), perspective up to +-4%, both random per page.
- **Seeds.** Hashed from the page index, fixed.
- **Reader options.** `formats: ["QRCode"]`, `tryHarder`, `tryRotate`, `tryDownscale`, `binarizer: "LocalAverage"`, `tryInvert: false`, the options of the video mode, with `maxNumberOfSymbols` varied. A symbol counts as read only when its bytes equal one of the nine payloads of that page.
- **Machine.** Apple M2 Pro, Node 25.9, one process per batch, four batches in parallel (decode times are single-image wall-clock times under that load).
- **Tiling fallback.** The photo cut into overlapping square windows (1000 px at stride 500, and 1200 px at stride 600), each decoded as a single symbol, results merged.

## Results

Main batch: 100 pages, page fills 92% of the photo height, 5.02 camera pixels per module.

| Approach | Symbols read | Pages with at least 8 of 9 | Wilson lower bound | Pages with 9 of 9 | Decode median (p95) |
|---|---|---|---|---|---|
| `maxNumberOfSymbols` 9 | 899 / 900 | 100 / 100 | 0.963 | 99 | 78 ms (113) |
| `maxNumberOfSymbols` 16 | 900 / 900 | 100 / 100 | 0.963 | 100 | 87 ms (101) |
| `maxNumberOfSymbols` 9, no downscale | 899 / 900 | 100 / 100 | 0.963 | 99 | 73 ms (88) |
| `maxNumberOfSymbols` 1 (today) | 100 / 900 | 0 / 100 | 0.000 | 0 | 67 ms (83) |
| Tiling, 1000 px windows | 140 / 900 | 0 / 100 | 0.000 | 0 | 207 ms (246) |
| Tiling, 1200 px windows | 339 / 900 | 0 / 100 | 0.000 | 0 | 199 ms (235) |

Informational batch: 52 pages, page fills 75% of the photo height, 4.09 camera pixels per module (the minimum of the defaults).

| Approach | Symbols read | Pages with at least 8 of 9 | Wilson lower bound | Pages with 9 of 9 | Decode median (p95) |
|---|---|---|---|---|---|
| `maxNumberOfSymbols` 9 | 468 / 468 | 52 / 52 | 0.931 | 52 | 84 ms (154) |
| `maxNumberOfSymbols` 16 | 468 / 468 | 52 / 52 | 0.931 | 52 | 138 ms (158) |
| `maxNumberOfSymbols` 9, no downscale | 467 / 468 | 52 / 52 | 0.931 | 51 | 79 ms (81) |
| `maxNumberOfSymbols` 1 | 52 / 468 | 0 / 52 | 0.000 | 0 | 72 ms (75) |
| Tiling, 1000 px windows | 301 / 468 | 0 / 52 | 0.000 | 0 | 215 ms (231) |
| Tiling, 1200 px windows | 454 / 468 | 50 / 52 | 0.870 | 40 | 206 ms (216) |

No run returned a symbol that was not one of the nine payloads (0 of 456 multi-symbol results had extra, unmatched symbols).

## Decision

Rule: if the multi-symbol path reads at least 8 of 9 symbols in at least 0.95 of the pages, use it.

- Main batch: 100 of 100 pages, Wilson lower bound 0.963. The rule holds, so the multi-symbol path is used.
- Tiling was not needed. Window tiling with a fixed window size is fragile: it depends on the window size matching the symbol size in pixels, and a window that holds several partial symbols returns an arbitrary one.

## Notes for the design

- `maxNumberOfSymbols` must be at least the number of symbols in view. Nine was enough for the 3 x 3 layout, 16 for margin. Both are the same speed within noise. Use one fixed value for page input (a page holds at most 9 symbols in the board layout).
- Decode time for a 12 MP photo is about 80 ms, in the same range as a 1080p video frame. The reader downscales large images by itself, and the no-downscale variant reads the same symbols, so the existing `tryDownscale` setting stays.
- The result list is not ordered by position. Symbols are identified by their packet content, not their place, which is what the codec needs.
- Order of return and duplicates: the same symbol can appear in two photos of overlapping pages. The codec ignores duplicate packets.

## Limits of this spike

- Synthetic images only. No real photo of a printed page has been decoded. The device check (`docs/device-test.md`) covers print defects, glare, uneven lighting and real lens distortion.
- Pages were flat and sharp enough for a hand-held photo at 5 px/module. At 4.1 px/module all nine were still read in every page tried, but 52 pages bound the rate only to 0.93.
- The live camera sees a lower resolution than a 12 MP still, so several symbols in a 1080p video frame get fewer pixels per module than here. That case is not measured.
- Timing is for one image on a fast desktop CPU, not a mid-range phone.
