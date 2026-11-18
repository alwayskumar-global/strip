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

Command, run for each of the six source files:

```
pyftsubset <source>.woff2 \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+2039,U+203A,U+2190,U+2192,U+2212,U+2248,U+2260,U+00D7" \
  --layout-features="kern,liga,calt,ccmp,locl,mark,mkmk,tnum,pnum,zero,case,lnum" \
  --flavor=woff2 --no-hinting --desubroutinize --output-file=<out>.woff2
```

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
| IBMPlexSans-Regular.woff2 | 10956 | 9ebf27622e07441a4c6ecd8a171dfa166bcb98c651edeb8f25f42c8b796af024 |
| IBMPlexSans-Medium.woff2 | 11484 | 8a2957c73a562b5cccc0bd096dd21524ccd174b2b6d87e1c03a483f57917f3b3 |
| IBMPlexSans-SemiBold.woff2 | 11660 | 7ef3cb2ed69b4c9b2a8a4304741dfb296373d143e75596ad5130988ce36fba71 |
| IBMPlexMono-Regular.woff2 | 7824 | dbad6d39b79518bd724eb71a4d66325ebac179aeb1d925cb0b06007a5143264a |
| IBMPlexMono-Medium.woff2 | 7820 | 01d9ee48c5eac8220f10b29b85354e2a2c974f9fe747b218122b06dd4f780f29 |
| IBMPlexMono-SemiBold.woff2 | 7824 | 19b11a5c89cf9063b3e7f37e4c45071f64af55f12b4fe231e0a0e6c88ca15aaf |

Total shipped: 57,568 bytes.

Licence caveat: the OFL notice names "Plex" as a Reserved Font Name, and a subset is a Modified Version under the OFL FAQ, so strictly the subset files should not carry the name. The CSS must keep the family names "IBM Plex Sans" and "IBM Plex Mono" because `strip.css` uses them. Recorded for the user's decision.
