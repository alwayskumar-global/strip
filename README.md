Strip turns any file into a printable strip or an animated on-screen code sequence that a phone camera reads back, entirely in the browser.

# Strip (working name)

In 1985 the Cauzin Softstrip printed software on paper as a strip of marks that a hand scanner read back into a computer. Strip is that idea rebuilt for a phone. Pick a file, print it as a few pages of codes, and a phone camera turns the pages back into the same file, byte for byte, with the name and type it had. No cable, no account and no network are involved: the paper is the transport, and it still works years later.

The same page also has a screen mode. Instead of printing, the file plays on screen as an animated sequence of codes, and a second phone reads the sequence from across a table. The sequence is fountain-coded, so a missed frame is not fatal and the receiver can join at any point.

Sender and receiver are one installable web app (a PWA). Everything runs on your device. There is no backend, no account, no network use at runtime, and no cloud.

## How it works

1. **Pick a file** (up to 256 KB). Strip hashes it, splits it into packets and adds repair packets.
2. **Show it.**
   - **Paper (the main path).** Each packet becomes a version-30 QR symbol. Nine symbols fit one A4 or Letter page. The page header says "Page p of N" and a 10 cm ruler lets you check that the print is at 100%. Files above 64 KB get a warning about the number of pages.
   - **Screen.** The symbols play as an animation at 2 to 15 frames per second, with pause, step, full-screen and a manual step mode that is the default when your system asks for reduced motion. The notice about flashing content is always on screen.
3. **Scan it.** Open Receive on another phone. Point the camera at the strip or the screen, or add photos of the printed pages one at a time. Packets arrive in any order; when enough have arrived the file is rebuilt, checked against its SHA-256 and offered for download.

## Run it

```
pnpm install
pnpm dev               # the app on http://127.0.0.1:5173
pnpm build             # production build in apps/strip/dist/app, with the service worker and the bundle report
pnpm lint
pnpm typecheck
pnpm test              # unit and property tests of every package, and the repository tools tests
pnpm test:e2e          # Playwright against localhost: harness, app, camera (a fake camera) and gallery projects
pnpm test:fidelity     # 53 screenshot and DOM comparisons against the design boards
```

Playwright uses its bundled Chromium (`pnpm exec playwright install chromium` once). The tests need no network.

## Measured claims

These are measurements with a stated sample size: evidence, not guarantees. Seeds are fixed, so the numbers reproduce. Details and the method are in the package READMEs ([codec](packages/codec/README.md), [symbols](packages/symbols/README.md)).

**Fountain codec** (`packages/codec`), fresh-seed verification, N = 1000 trials per row, asserted at 0.99:

| Claim | K | successes / N | Wilson 95% lower bound |
|---|---|---|---|
| M1 late join (repair packets only) | 50 / 100 / 500 | 1000 / 998 / 1000 | 0.9962 / 0.9927 / 0.9962 |
| M2 cold start with 30% loss | 50 / 100 / 500 | 990 / 1000 / 998 | 0.9817 / 0.9962 / 0.9927 |
| M3 page mode (`K + R(K)` packets, 5% loss) | 50 / 100 / 500 | 1000 / 998 / 1000 | 0.9962 / 0.9927 / 0.9962 |

M2 at K = 50 sits exactly on the 0.99 line. A page sized for 5% loss does not survive much more: at 10% loss the success rate was 0.991 (K = 50), 0.979 (K = 100) and 0.337 (K = 500). The overhead factors behind the page size come from a calibration with N = 3000 trials per row for K up to 100, N = 1000 up to K = 500 and N = 100 to 300 above that.

**QR symbol layer** (`packages/symbols`), synthetic camera-like degradation (warp, blur, contrast, gradient, noise) of real symbols decoded by the pinned reader:

| Gate | N | Result |
|---|---|---|
| Default cell (version 30, level L, 4 px per module), typical profile | 200 | 200/200, Wilson 95% lower bound 0.981 (asserted at least 0.90 for screen, 0.97 for print) |
| Clean symbols, every version 1 to 40 at every ECC level | 320 | 320/320 |
| Photo of a printed A4 page, 3 x 3 symbols at about 5 px per module (synthetic) | 100 pages | 900/900 symbols, 100/100 pages, lower bound 0.963 |
| Decode of that 12 MP photo, median | 20 | 70 ms (budget 250 ms) |
| Decode of a 1920 x 1080 frame, median | 20 | 7.8 to 8.1 ms (budget 40 ms) |
| 3 px per module, blur 1 px (the documented limit, not asserted) | 100 | 0.38 |

**End to end in this repository** (Chromium, `pnpm test:e2e`):

| Path | File | K | T | Result |
|---|---|---|---|---|
| Paper: print layout, page images, receiver | 184 KB | 111 | 149 | 17 A4 sheets, 13 sheets were enough, byte-identical, about 6 s |
| Screen: stage captures through a fake camera | 40,000 B | 24 | 48 | byte-identical, 25 frames decoded, about 5 s |

## Known limits

- **No real phone has read a code from this app yet.** The default symbol (version 30, level L, 1,732-byte packets) is untested on real phones. Every number above comes from synthetic images or from Chromium's fake camera. The plan for three real phones is in [docs/device-test.md](docs/device-test.md). If a phone fails, the default cell can move.
- **File size.** The app takes files up to 256 KB. Above 64 KB the paper path warns about the page count.
- **Large files (codec).** Above about K = 1000 (roughly 2.9 MB at the default block size) a late join needs more packets, because the Gaussian elimination cap (`maxGaussianBlocks`, default 1024) stops the decoder from eliminating while more than 1024 blocks are unsolved. The decoder keeps collecting and finishes, but needs about 1.6x to 1.9x the packets in the cases measured. The app's 256 KB cap keeps K at or below 155, so the app does not reach this.
- **Photos of printed pages** are decoded with a synthetic test only; a real printer and a real camera may be worse than the model.
- **iPhone Safari** camera behaviour is not tested.

## Privacy

Files and images are read into memory on your device and nothing is uploaded. The page loads only its own files: no fonts, scripts or analytics from other hosts. Nothing is stored in the browser except the app's own files in the Cache API (for offline use). A test records every request over the whole send and receive flows and fails on anything else. The content security policy (`connect-src 'self'`, `frame-ancestors 'none'`) and `Permissions-Policy: camera=(self)` are sent as response headers; see `apps/strip/vercel.json`.

## Prior art

This is not a new idea, and the transport is not a claim of novelty. Related projects, as far as we know:

- **Decimen Optical Transfer**: a browser-based tool that shows a file as a stream of fountain-coded animated QR codes and reads it with another device's camera. The closest relative of Strip's on-screen mode.
- **TXQR**: protocol and tools that send data as animated QR codes, using fountain codes so frames can be missed.
- **cimbar**: a high-density colour 2D barcode with its own error correction, used with fountain-coded file transfer from a screen.
- **PaperBack**: prints a file on paper as a dense dot pattern with redundancy and reads it back from a scan.
- **qr-backup**: backs up files on paper as QR codes.
- **Cauzin Softstrip** (1985): the historical model for data strips on paper.

Strip combines parts that already exist: a standard QR encoder and reader, and its own fountain codec. What it adds is the packaging: one offline PWA that does both the printable strip and the animated screen, with no backend, account or network use at runtime.

## What is where

- `apps/strip`: the PWA (sender and receiver).
- `packages/codec`: the fountain codec (pure, no dependencies).
- `packages/symbols`: QR encode and decode wrappers.
- `design/`: the design export. The HTML boards and `strip.css` are the source markup of the application's components.
- `.kiro/`: how this was built with Kiro: `specs/` (requirements, design and tasks for the codec, the symbols and the app), `steering/` (the rules every task followed) and `hooks/` (lint, typecheck, purity and dependency-log checks).
- `docs/dependencies.md`: every dependency, with exact version, licence and reason, and how the font subsets were made. `docs/device-test.md`: the real-device check.

## Disclosure

Visual design was produced outside Kiro with Claude Design. The HTML exports in design/ are the source markup that Kiro converted into the application's components. All application code in this repository was written in Kiro.

## Third-party notices

The notices for everything the app ships (qr, zxing-wasm and zxing-cpp, React and react-dom, the IBM Plex fonts) are in [apps/strip/public/THIRD_PARTY_NOTICES](apps/strip/public/THIRD_PARTY_NOTICES) and are served at `/THIRD_PARTY_NOTICES`.

## License

MIT. See [LICENSE](LICENSE).
