# Dependencies

Every dependency is exact-pinned and needs a row here, plus explicit approval, before it is added. A new package gets its row in the same commit that adds it.

This table lists direct dependencies (runtime and dev) declared in any `package.json`. Transitive dependencies are locked in `pnpm-lock.yaml`.

| name | exact version | license | reason |
| ---- | ------------- | ------- | ------ |
| qr | 0.7.2 | MIT OR Apache-2.0 | QR Code encoder (encoder only, used under MIT) for @strip/symbols. Pure JavaScript, no dependencies, no WebAssembly, no CSP change. Its decoder is not used. |
| zxing-wasm | 3.1.7 | MIT | QR Code reader (reader build only) for @strip/symbols. WebAssembly decoder (reader .wasm 946,598 bytes, bundles Apache-2.0 zxing-cpp), self-hosted, needs 'wasm-unsafe-eval' in script-src. Chosen over qr's decoder after the decoder spike. |
| @eslint/js | 10.0.1 | MIT | ESLint recommended rule set (dev). |
| @playwright/test | 1.65.1 | Apache-2.0 | Browser end-to-end tests in bundled Chromium against a localhost harness (dev). |
| eslint | 10.15.0 | MIT | Linting, purity bans and package-boundary rules (dev). |
| fast-check | 4.10.2 | MIT | Property-based tests for correctness properties (dev). |
| globals | 17.14.0 | MIT | Environment globals for ESLint flat config (dev). |
| typescript | 6.0.3 | Apache-2.0 | TypeScript compiler, strict typecheck. Pinned to 6.0.x because typescript-eslint does not support TS 7 (dev). |
| typescript-eslint | 8.72.2 | MIT | TypeScript parser and rules for ESLint (dev). |
| vite | 8.3.8 | MIT | Dev server and bundler for the PWA (dev). |
| vitest | 5.1.0 | MIT | Unit and property test runner (dev). |
| react | 19.3.1 | MIT | UI library for the Strip PWA (the design boards are converted to React components). Runtime. |
| react-dom | 19.3.1 | MIT | React DOM renderer for the Strip PWA. Runtime. |
| @types/react | 19.3.0 | MIT | TypeScript types for react (dev). |
| @types/react-dom | 19.3.0 | MIT | TypeScript types for react-dom (dev). |

### Font assets (not npm dependencies)

| Asset | Source version and licence | Reason |
|---|---|---|
| IBM Plex Sans | @ibm/plex-sans 1.1.0, OFL-1.1 | Self-hosted UI font, 400/500/600, subset woff2 in apps/strip/public/fonts. See "Font subsets" below. |
| IBM Plex Mono | @ibm/plex-mono 2.5.0, OFL-1.1 | Self-hosted mono font, 400/500/600, subset woff2 in apps/strip/public/fonts. See "Font subsets" below. |

## Font subsets

Source: IBM/plex GitHub repository, tags `@ibm/plex-sans@1.1.0` and `@ibm/plex-mono@2.5.0`, files `packages/plex-{sans,mono}/fonts/complete/woff2/IBMPlex{Sans,Mono}-{Regular,Medium,SemiBold}.woff2`. Licence text: `LICENSE.txt` at the same tag (SHA-256 `7e6b2818edbd8f6a01ae80641cc8f16a51080d08fb4e532be3a0b6f74adb07da`), shipped as `apps/strip/public/fonts/OFL.txt` and as section D of THIRD_PARTY_NOTICES.

Tool, used once and not part of the repo: fonttools 4.60.2 and brotli 1.2.1 in a throwaway virtualenv (`/tmp/fonts-venv`). No Python file or requirements file is committed.

Command, run for each of the six source files (`<Fam>` is `Sans` or `Mono`):

```
pyftsubset <source>.woff2 \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+2039,U+203A,U+2190,U+2192,U+2212,U+2248,U+2260,U+00D7" \
  --layout-features="kern,liga,calt,ccmp,locl,mark,mkmk,tnum,pnum,zero,case,lnum" \
  --flavor=woff2 --no-hinting --desubroutinize \
  --name-IDs='*' --name-languages='*' --name-legacy --output-file=<tmp>.woff2
python rename.py <tmp>.woff2 <out>.woff2 <Fam>
```

`rename.py` (kept outside the repo, reproduced here in full) rewrites the name table so the Reserved Font Name does not appear in the font's own names:

```python
import sys
from fontTools.ttLib import TTFont
src, dst, fam = sys.argv[1], sys.argv[2], sys.argv[3]   # fam: Sans | Mono
f = TTFont(src)
for r in f['name'].names:
    if r.nameID in (1, 3, 4, 6, 16, 17, 21, 22, 25):     # family, unique id, full, PostScript, typographic and WWS names
        s = r.toUnicode()
        s = s.replace(f"IBM Plex {fam}", f"Strip {fam}").replace(f"IBMPlex{fam}", f"Strip{fam}").replace("Plex", "Strip")
        r.string = s
f.flavor = "woff2"
f.save(dst)
```

The shipped fonts are therefore named "Strip Sans" and "Strip Mono" internally (family, full, PostScript and unique-ID names). The copyright (ID 0), trademark (ID 7), designer (ID 9), designer URL (ID 12), licence text (ID 13) and licence URL (ID 14) records are kept as in the source. The CSS family labels in `fonts.css` stay "IBM Plex Sans" and "IBM Plex Mono" because `strip.css` uses them; they are labels used by the page's own stylesheet, not font names inside the files. The file names `IBMPlex*.woff2` are kept.

Unicode set: Basic Latin, Latin-1 Supplement, en and em dash, curly quotes, bullet, ellipsis, single guillemets, left and right arrows, minus, approximately equal, not equal, multiplication sign. (The middle dot U+00B7 and U+00D7 are inside Latin-1.) The boards use `· × – — ’ “ ” … › ≈ ≠`.

| Source SHA-256 | Source file |
|---|---|
| ba711a3085ff9f27440b6b9c4550cfc47c97bf36591d5da958b975bb3add8c1a | IBMPlexSans-Regular.woff2 |
| 5660f8a658f8bb50dbc005232f885eadffd2bc1c235c4f6fbb63469d1f9cde6d | IBMPlexSans-Medium.woff2 |
| f78048030eab62e860efa39a0df79e2e5581bf122eb95b9bc42c0b8a4988d205 | IBMPlexSans-SemiBold.woff2 |
| ba204497f16b6d334cee9d1e963a831b73e3a56e1d6300a8489d18df7214b350 | IBMPlexMono-Regular.woff2 |
| 33faf307fa6031fb4062276d7320a6d632de890cbb347576fd80cfa01077bc25 | IBMPlexMono-Medium.woff2 |
| 6a825b4824c01cbb401e829e5a066a1818411bcb3538b5a5792c5ca9b82343c3 | IBMPlexMono-SemiBold.woff2 |

| Shipped file | Bytes | SHA-256 |
|---|---|---|
| IBMPlexSans-Regular.woff2 | 11536 | 30a1a2c166c3b4d84227a4f4ed318f0618826a5e502c8a31e747c6a0e2ccdcc8 |
| IBMPlexSans-Medium.woff2 | 12116 | 3858589ca68e277f78feff59b9b0a7448d96ba21f9b4bbe1d03cd0b487a1d71e |
| IBMPlexSans-SemiBold.woff2 | 12236 | d9efdf6fcfd7c07cc7b1ef41028385c2d6bef40ae3f0b9d8e5dd23e314c26060 |
| IBMPlexMono-Regular.woff2 | 8444 | ea384a6d67ffab740ee13925eaa909f8d8bc17d4669425267fb3028ea5b859ef |
| IBMPlexMono-Medium.woff2 | 8448 | 7a574aa6c3638c1f5753b9fef7920414bca500ed3a3954ebd222d615f9f9128f |
| IBMPlexMono-SemiBold.woff2 | 8484 | 86d10d8687ade66867ee82a6f13f972c40c2f22e40b5a7d4ae731614a0326b17 |

Total shipped: 61,264 bytes.

Licence note: the OFL notice names "Plex" as a Reserved Font Name, and a subset is a Modified Version under the OFL FAQ. The shipped files therefore carry the internal names "Strip Sans" and "Strip Mono" (see above) and the OFL text and copyright are kept. The user chose this over leaving the names unchanged. Residual: the trademark record (ID 7) and the `IBMPlex*.woff2` file names still say "Plex", and the page's CSS labels the faces "IBM Plex Sans" and "IBM Plex Mono".
