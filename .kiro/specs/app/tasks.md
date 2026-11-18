# Implementation Plan: App (`@strip/app`)

## Overview

Five groups ordered by value. Group 1 builds the shell, the hand-written router, fonts, the byte-identical stylesheet, React 19, and the fidelity harness first, then converts every board to a presentational React component with a pure view-model, each conversion verified by its fidelity and DOM-parity targets (no services yet). Group 2 builds the paper send pipeline and the receive-from-images pipeline and proves them together with the paper round trip. Group 3 adds the live camera receiver and the screen stream sender with the screen-path e2e. Group 4 adds the PWA, delivery headers, privacy checks, bundle gate and README. Group 5 is polish, accessibility checks, the perf and measured reports, and the device-test hand-off.

Everything above the CUT LINE is required for submission and totals 643 credits. The whole file totals 729 credits. Group 5 sits below the line.

Already done and NOT scheduled here: the codec export `pageRepairCount`, and the removal of `zod`.

Tag legend:

| Tag | Meaning | Command |
|---|---|---|
| [unit] | example or table test, including property-free Playwright assertions that carry the design's assertion without a generator | `pnpm test` (or `pnpm test:e2e` when it needs Chromium) |
| [property] | fast-check property (at least 100 runs, fixed seed), or a property-style Playwright check that iterates over a generated or enumerated input family | `pnpm test` or `pnpm test:e2e` / `pnpm test:fidelity` |
| [Playwright] | Chromium test against a local server | `pnpm test:e2e` |
| [perf] | perf script | `pnpm perf` |
| [manual] | recorded human check | none |

Sizes: S = 8, M = 15, L = 30, XL = 45 credits. A checkpoint sub-task costs 3 (a report only).

## Global rules

1. **Stop-and-wait.** Stop and report on: a failed requirement, a test failing twice, a property counterexample, an ambiguity, a dependency decision, or a cap overrun. Never work around it. If you hit a context limit, commit and state the next sub-task.
2. **Budget.** The total implementation budget is 800 credits (about 150 more are held back for demo fixes outside this plan). Per-group estimates and hard caps (estimate + 20%) are on each group heading.
3. **Cut line.** Tasks below `## CUT LINE` are dropped first if the budget runs short. Everything above the line is required and totals at most 650 credits. If a below-the-line task is cut, the criteria listed in "Criteria dropped if the CUT LINE tasks are cut" lose their coverage and the final report says so.
4. **Running-total rule.** At each checkpoint report the credits used against the estimate; if the running total exceeds the cumulative estimate by more than 15%, stop and report before continuing. Cumulative estimates: after Group 1: 251, Group 2: 404, Group 3: 542, Group 4: 643, Group 5: 729.
5. **Commits.** One commit per sub-task, with the checkbox ticked in the same commit. Conventional messages: `feat(app): ...`, `test(app): ...`, `build(app): ...`, `docs(app): ...`, and the commit message names the task id.
6. **Dependencies.** Only the four React packages in 1.1 are new, latest 19.x, exact-pinned (no `^` or `~`): `react`, `react-dom`, `@types/react`, `@types/react-dom`. Each gets its `docs/dependencies.md` row (name, exact version, license, reason) in the same commit as its `package.json` change. Any other dependency is a decision: stop and ask. No `zod`, no router library, no new test library.
7. **Design hand-off.** `design/project/*.dc.html` and `strip.css` are source markup: keep class names, text, structure and ARIA. Every deviation, every template construct used, every inline `style=""` converted, and every addition beyond `strip.css` is listed in the sub-task report. `codegen.js` and `support.js` are never shipped. No Google Fonts request anywhere. The fidelity gate (1% of pixels, QR regions masked) and DOM parity must pass for the targets each conversion task names; a failing diff fails the task.
8. **Purity and boundaries.** No `Math.random`, `Date.now`, `performance.now`, `new Date()` or `timeStamp` outside `apps/strip/src/clock`. Presentational components and `state/` call no service. Apps import only package barrels. The harness-only gallery is excluded from the production bundle.
9. **Per-group verification.** After each group run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and for groups touching UI or e2e `pnpm test:e2e` and `pnpm test:fidelity`; report the outputs.
10. **Property tag convention.** Every [property] test carries the comment `Feature: app, Property N: <text>` and is one test. Only the core properties are real property tests (see "Property split"). All others carry the same assertion as a plain unit or Playwright test.
11. **Gating.** Do not start the next group until the previous group's checkpoint passes. Group 5 starts only when the user says so.

## Tasks

- [ ] 1. Group 1: shell, router, fonts, stylesheet, fidelity harness, all board conversions (estimate 251, CAP 301)
  - [x] 1.1 React 19 dependencies and JSX toolchain (S, 8)
    - First check Vite 8's Oxc JSX transform (`oxc.jsx`, automatic runtime) with a throwaway component; report the finding. If it needs a plugin, stop and ask.
    - Add latest 19.x exact-pinned `react`, `react-dom`, `@types/react`, `@types/react-dom` to `apps/strip/package.json`, each with a `docs/dependencies.md` row in the same commit. `tsconfig.json` gets `"jsx": "react-jsx"`; ESLint and Vitest globs move from `*.ts` to `*.{ts,tsx}`; `vitest.config.ts` stays node environment.
    - Test: `tools/deps.test.ts` passes with the four new rows and no `^` or `~` (R22.4) [unit].
    - Test: `renderToStaticMarkup(<div className="x"/>)` compiles and renders under Vitest (R22.7) [unit].
    - _Requirements: 22.3, 22.4, 22.5, 22.7_
  - [x] 1.2 App shell, limits, clock, CSP constants (M, 15)
    - `index.html`, `main.tsx`, `env.d.ts`, `limits.ts` (the only definitions of FILE_CAP_BYTES 262144, PAPER_WARN_BYTES, PER_PAGE 9, FPS 2/15/8, STEP_HISTORY 256, timeouts, image limits), `csp.ts` adds `APP_CSP` and `SECURITY_HEADERS`, `Chrome` (`header.nav`), `App.tsx` (route switch, error boundary, focus-to-main-heading on navigation).
    - Vite dev and preview headers come from `csp.ts`. Production `index.html` has no inline script, style or `style=""`.
    - Test: limits constants equal the Requirements values (R9.1, R9.2, R9.3) [unit].
    - Test: `APP_CSP` equals `STRIP_CSP` and includes `worker-src 'self'` (R15.1) [unit].
    - Test: focus lands on the main heading after a route change (R17.4) [unit].
    - _Requirements: 8.1, 8.6, 9.1, 9.2, 9.3, 15.1, 15.2, 15.3, 17.4, 22.2_
  - [x] 1.3 Hand-written router, link interception, href map (M, 15)
    - Pure `router.ts` (`matchRoute`, `titleOf`, `navLinkCurrent`), `router-store.ts` (history), `links.ts` (`shouldIntercept`), `href-map.ts` for every `href` in the 34 boards. Six routes, unknown path replaced by `/`, `/send/screen` and `/send/paper` without a file resolve to `/send`.
    - Test: for any string, `matchRoute` returns one of six ids or null, null becomes `/`, `titleOf` equals the board title (P17, R8.2, R8.7) [property].
    - Test: for any click and anchor description, `shouldIntercept` is true exactly for plain same-origin known-route left-clicks (P18, R8.3) [property].
    - Test: per route exactly one nav link (none on `/`) has `aria-current="page"` (P19, R8.4, R1.1) [unit].
    - Test: every board `href` maps to a route, hash or external URL; no built file contains `.dc.html` (P20, R8.5, R19.7) [unit].
    - _Requirements: 1.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8, 19.7_
  - [x] 1.4 Self-hosted fonts, byte-identical `strip.css`, template-syntax scan (M, 15)
    - Six IBM Plex woff2 (Sans and Mono, 400, 500, 600, Latin plus `≈ ≠ × · … ’ – → ←`) and the OFL licence file in `apps/strip/public/fonts`; `src/styles/fonts.css` with the six `@font-face` rules (`font-display: swap`); `src/styles/strip.css` copied byte for byte from `design/project/strip.css`; `strip-additions.css` limited to the rules R19.8 lists, each reported as an addition.
    - Test: shipped `strip.css` hash equals the pinned SHA-256 and equals `design/project/strip.css` byte for byte; `fonts.css` and `strip-additions.css` contain only allowed rules (P37, R19.2, R19.8) [unit].
    - Test: `src` contains none of `{{`, `sc-for`, `sc-if`, `dc-import`, `x-dc`, `<helmet`, `data-dc-script`, `hint-`, `fonts.googleapis.com`, `codegen`, `support.js`, `.dc.html` (P38, R19.1, R19.5) [unit].
    - Test: glyph coverage of the six fonts for the listed characters (R19.9) [unit].
    - _Requirements: 19.1, 19.2, 19.5, 19.8, 19.9_
  - [x] 1.5 Fidelity harness: baseline server, setup project, route interception (L, 30)
    - `e2e-harness/app-server.mjs` (ports 5182 production, 5183 gallery, 5184 baseline over HTTP for `design/project` with `/__fonts/` and virtual wrapper boards for the 10 Receive phases and 14 error kinds), `e2e-fidelity/targets.ts` (53 targets, viewports read from `canvas.json`), `baseline.setup.ts` (project `fidelity-baseline` renders baselines from `support.js`), external-host route interception excluding `127.0.0.1` and `localhost`.
    - The facts in design.md "Fidelity harness" are re-verified here and the task fails loudly if they change.
    - Test: `support.js` never requests `cdn.jsdelivr.net` or any other external host except the intercepted fonts CSS (R20.2) [Playwright].
    - Test: each of the 53 baselines renders `.strip` with no `.sc-has-error` and no console error (R20.1) [Playwright].
    - Test: existing harness specs on 5173, 5180 and 5181 pass; a spec may be retargeted to the harness page `/e2e-harness/index.html` when the app now owns `/`, with its assertion unchanged (R22.8) [Playwright].
    - _Requirements: 20.1, 20.2, 20.3, 22.8_
  - [x] 1.6 Fidelity spec, QR masks, `data-addition` hiding, DOM-parity normaliser (L, 30)
    - `fidelity.spec.ts` using `toHaveScreenshot` at `maxDiffPixelRatio: 0.01`, `retries: 0`, QR masks (`svg.code`, `.stage__code`, `.fs__code`, `.vf__code`, `.vf video`, `.vf canvas`), `data-addition` hidden through the screenshot `style` option; `normalize-dom.ts`, `dom-parity.spec.ts`, `parity-allowlist.ts` (each entry justified); `pnpm test:fidelity` script. Targets without a converted component yet are skipped with a named reason that each conversion task removes.
    - Test: the comparison passes baseline against itself and fails when a 2% pixel region changes (R20.4, R20.5) [Playwright].
    - Test: for each of the 53 targets the screenshot differs by at most 1% of pixels with codes masked and `data-addition` hidden, at the same size (P36, R20.1 to R20.10) [property].
    - Test: for each of the 53 targets the normalised DOM equals the baseline's except allowlisted deviations (P35, R19.1, R20.1) [property].
    - _Requirements: 19.1, 20.1, 20.3, 20.4, 20.5, 20.6, 20.8, 20.9, 20.10_
  - [x] 1.7 `Symbol` component, gallery scaffold, gallery exclusion (L, 30)
    - `symbolPath(matrix)`, `Symbol` component from `SymbolMatrix` (merged horizontal runs shifted by 4, viewBox `size + 8`), `gallery/` scaffold and fixtures, the single `if (__STRIP_GALLERY__)` dynamic import in `App.tsx`, `build:gallery` script, `dist.test.ts`, ESLint restriction on gallery imports.
    - Test: for any SymbolMatrix, the `d` string equals the dark modules as merged runs, re-expanding gives the matrix, viewBox side is `size + 8` (P11, R19.12) [unit].
    - Test: for 6 specimen Packets, rasterise at 4 px per module and `decodeFrame` returns a Packet `decodePacket` accepts (P12, R1.4) [Playwright].
    - Test: production build has no gallery chunk, no sentinel, no `page--m`, no `fs--m`; the gallery build has them; no built file contains `.dc.html` (P40, R7.1, R19.11, R20.7) [unit].
    - _Requirements: 1.4, 7.1, 19.11, 19.12, 20.7_
  - [x] 1.8 Convert Home and HomeMobile (M, 15)
    - `HomeView`, `toHomeVM(sample)` (specimen tiles seeds 0 to 5), the `THIRD_PARTY_NOTICES` and REPO_URL links; gallery route; fidelity and parity targets: Home desktop, Home mobile (2). Remove the skip for those targets.
    - Test: `renderToStaticMarkup(HomeView)` contains the board copy verbatim (R1.1 to R1.7) [unit].
    - Test: fidelity and DOM parity pass for the 2 Home targets (R20.1) [Playwright].
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 19.1, 19.3, 19.4_
  - [x] 1.9 Convert Send with its four stages, desktop and mobile (M, 15)
    - `SendView` (`stage`: `chosen`, `empty`, `toolarge`, `emptyfile`), `FileCard`, `OutputChoices`, `toSendVM(state)`; fidelity and parity targets: Send, SendEmpty, SendTooLarge, SendEmptyFile, desktop and mobile (8).
    - Test: VM-to-markup equals the board copy for each stage (R2.1 to R2.17) [unit].
    - Test: fidelity and DOM parity pass for the 8 Send targets (R20.1) [Playwright].
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.13, 19.1, 19.3, 19.4_
  - [x] 1.10 Convert SendScreen: play, paused, step and full screen (M, 15)
    - `StreamView` (`mode`: `play`, `paused`, `step`), `FullScreenView`, `toStreamVM`, `toFullScreenVM`; the Photosensitivity_Notice verbatim; fidelity and parity targets: SendScreen, Paused, Step, Full, desktop and mobile (8).
    - Test: `toStreamVM` gives the board's tag, class, label and note per mode, `Previous` and `Next` disabled exactly in `play`, range disabled exactly in `step` (P15, R3.2, R3.3) [unit].
    - Test: fidelity and DOM parity pass for the 8 stream targets (R20.1) [Playwright].
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 3.13, 3.14, 19.1, 19.3, 19.4_
  - [x] 1.11 Convert SendPaper A4 and Letter (M, 15)
    - `PaperView` (size is CSS state through radios and `:has()`), tile grid 3 by 3, print header; fidelity and parity targets: SendPaper, SendPaperLetter, desktop and mobile (4).
    - Test: VM-to-markup equals the board copy and the tile grid has 9 `figure.tile` (R4.1 to R4.14) [unit].
    - Test: fidelity and DOM parity pass for the 4 paper targets (R20.1) [Playwright].
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 4.10, 19.1, 19.3, 19.4_
  - [x] 1.12 Convert Receive: desktop board and 10 phases (L, 30)
    - `ReceiveView` (`phase`: `empty`, `ask`, `denied`, `nocam`, `scan`, `repeat`, `dup`, `verify`, `done`, `failed`; `viewfinder?` slot), `Ring` (the only component allowed a `style` prop, CSSOM custom property), `arc`, `tick`, `toReceiveVM`, Photo_List markup; fidelity and parity targets: Receive desktop plus 10 phases (11).
    - Test: for each of the 10 phases and any counters, `toReceiveVM` equals the Appendix D copy with computed numbers; the meter shows whenever `total` is above 0 (P32, R5.1 to R5.15) [unit].
    - Test: for any percent 0 to 100, `arc(p)` is empty at 0 and the full circle at 100; `tick(k)` times K equals the circumference (P24, R5.9) [unit].
    - Test: fidelity and DOM parity pass for the 11 Receive targets (R20.1) [Playwright].
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 5.15, 19.1, 19.3, 19.4_
  - [x] 1.13 Convert About and the Error panel with 14 kinds (M, 15)
    - `AboutView`, `toAboutVM()`, `ErrorPanel` (`kind`: `size`, `empty`, `imgread`, `imgbig`, `imgmany`, `nocode`, `denied`, `nocamera`, `nothing`, `otherfile`, `hash`, `internal`, `camera`, `stall`), `toErrorVM`; Errors and ErrorsAll boards; fidelity and parity targets: About (2), Errors and ErrorsAll desktop and mobile (4), 14 kinds (14); this completes all 53 targets with no skip.
    - Test: for each of the 14 kinds and any context, `toErrorVM` equals the Appendix F copy, rows, icon and hrefs (P33, R7.2 to R7.5, R7.10 to R7.15) [unit].
    - Test: fidelity and DOM parity pass for the 20 targets of this task and for all 53 in one run (R20.1) [Playwright].
    - Report the full list of template constructs used, inline-style conversions and additions (R19.4, R19.6).
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.2, 7.3, 7.4, 7.5, 7.10, 7.11, 7.12, 7.13, 7.14, 7.15, 19.1, 19.4, 19.6, 20.1_
  - [x] 1.14 Checkpoint: Group 1 stop-and-report
    - Run lint, typecheck, test, build, `build:gallery`, `test:e2e`, `test:fidelity`; report outputs, credits used against 251 (cap 301), deviations, additions, and the template-construct list. Stop. Rerun the whole e2e suite (all projects), not only the new tests.
    - _Requirements: 20.6, 22.1_

- [ ] 2. Group 2: paper send pipeline and receive from images (estimate 153, CAP 184)
  - [x] 2.1 File intake, formatting, hash chip, send-step reducer (M, 15)
    - `file-intake.ts` (`classify`, 256 KB cap, read only in `chosen`), `mimeOf`, `format.ts` (KB, MB, bytes, `{cap}`), `sha256WebCrypto`, hash chip (first 12 hex in 3 groups of 4), `send-step.ts` reducer, `SendScreen` container wired to `SendView`.
    - Test: for any size, `classify` is `emptyfile` at 0, `chosen` for 1 to cap, `toolarge` above; cap and cap + 1 boundaries; bytes are read only in `chosen` (P2, R2.2, R2.11, R2.12, R9.1) [property].
    - Test: for any `File.type`, `mimeOf` returns a valid codec MIME, `application/octet-stream` when empty, over 127 bytes or non-ASCII (P3, R2.14) [unit].
    - Test: size strings parse back within rounding (P5, R2.3, R2.4, R2.11) [unit].
    - Test: hash chip equals the first 6 bytes of the Metadata_Record hash (P6, R2.4, R2.5) [unit].
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.11, 2.12, 2.14, 9.1, 9.4, 9.8_
  - [x] 2.2 Paper pipeline: encode, page, repair count, paginate, symbols (L, 30)
    - `paper-pages.ts`: `READ_AND_ENCODE` with the codec Encoder at `MAX_PAYLOAD`, `page()` Packets, `pageRepairCount(K)` for T without encoding, `paginate(T)`, `encodeSymbol(packet, { version: 30, ecc: "L" })`, session id and `Session_Short`, header copy.
    - Test: for any file of 1 to cap bytes with any name and MIME, `page()` Packets pushed to a codec Decoder complete with identical bytes, name and MIME (P1, R10.1, R21.1) [property].
    - Test: for any file and any permutation of the tile Packets, a codec Decoder completes with identical bytes (P9, R10.12) [property].
    - Test: K and T at 16, 32, 64, 128, 184, 256 KB equal the pinned values; loop seconds `round(T / 8)`; pages `ceil(T / 9)` (P7, R9.6, R2.7) [unit].
    - Test: `paginate(T)` gives `ceil(T / 9)` pages, each sequence once and in order, labels `P{p}·{ii}` and captions `{g}/{T}` unique (P8, R10.4, R10.5) [unit].
    - Test: `encodeSymbol` at packetSize 1732 has size 137 and drawn viewBox 145 (P10, R10.2, R10.3) [unit].
    - Test: Session_Short is 4 uppercase hex digits, or 8 for both when the two 4-digit forms in view are equal (P25, R4.8) [unit].
    - _Requirements: 4.8, 9.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.12, 2.7_
  - [x] 2.3 PaperScreen: sheets, print CSS, `window.print` (M, 15)
    - `PaperScreen` container renders 9 tiles per sheet, A4 and Letter, print CSS, the "Page {p} of {N}" header, the print button calling `window.print`, the paper size warning above PAPER_WARN_BYTES, the route guard to `/send` without a file.
    - Test: sheet count and header text for T from 1 to 200 (R10.5, R10.6) [unit].
    - Test: paper warning shows above 65,536 bytes and not at it (R9.8) [unit].
    - Test: print button calls `window.print` once (R10.7) [unit].
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 10.6, 10.7, 10.8, 9.8_
  - [x] 2.4 Image intake, scaling, decode client and worker wiring (M, 15)
    - `image-intake.ts` (20 MB, 24 photos, long side 4096), `scaleOf`, move the worker files into `workers/` with `smart_relocate`, `maxSymbols: 9`, `decode-client` drop-while-busy, transfer list.
    - Test: for any width and height, `scaleOf` keeps each side at most 4096 (at most 16,777,216 pixels), keeps aspect within one pixel, leaves smaller images unscaled; the 20 MB and 24-photo limits hold at the boundary (P29, R12.11, R12.12, R12.13) [property].
    - Test: for any interleaving of camera and image submits at most one decode is in flight, every busy submit resolves `dropped` with no post, and a dropped bitmap is closed (P30, R12.3, R12.10) [property].
    - Test: the transfer list holds each Packet buffer exactly once (P31, R12.5) [unit].
    - _Requirements: 12.3, 12.5, 12.10, 12.11, 12.12, 12.13_
  - [x] 2.5 Receive reducer, photo list, rebuild, verification, download (L, 30)
    - `receive.ts` reducer, `photos.ts`, `ReceiveScreen` image path: Photo_List add and remove, rebuild of the Scan_Session from the remaining sources in order, SHA-256 verification, download with the original name and MIME, progress meter and counters.
    - Test: for any event sequence (Packets of sessions A and B, duplicates, corrupt Packets, user actions, stale generations) the phase is one of 10, `done` only when the codec is complete, terminal states have no outgoing transitions except restart (P21, R12.1, R12.2, R12.6) [property].
    - Test: for any Packet sequence, Packets seen, distinct, solved and percent never decrease within a session; percent is 100 only when complete (P23, R12.7, R12.8) [property].
    - Test: for any photo list and any removed row, the rebuilt Scan_Session equals a fresh session fed the remaining sources in order (P26, R12.24, R21.11) [property].
    - Test: Photo_List count tag and row texts use singular and plural forms and `{m}` equals the sum of found counts (P34, R5.16) [unit].
    - Test: download uses the original name and MIME and bytes equal the sent file (R12.14, R12.15) [unit].
    - _Requirements: 5.16, 12.1, 12.2, 12.6, 12.7, 12.8, 12.14, 12.15, 12.24, 21.11_
  - [x] 2.6 Error mapping and Error panel wiring (M, 15)
    - `disposition.ts`: one disposition per origin for the 10 `ERROR_CODES`, 4 `SYMBOL_ERROR_CODES`, 4 Ignore_Reasons, 5 outcome kinds, image failures and camera names; `ErrorPanel` wired into `SendScreen`, `ReceiveScreen` and the `App` error boundary.
    - Test: every member has exactly one disposition per origin and unreachable ones are marked (P27, R13.1, R13.3 to R13.7) [unit].
    - Test: for any error value (any code, any message) the rendered text has no code string and no stack trace (P28, R13.2, R13.8) [unit].
    - Test: for any name that breaks the codec name rules the panel is `internal` and the name is never altered (P4, R9.7, R13.10) [unit].
    - _Requirements: 7.6, 7.7, 7.8, 9.7, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11_
  - [x] 2.7 Paper-path end-to-end: print layout to page images to receiver (L, 30)
    - Project `app` (production build on 5182), `deviceScaleFactor: 3`, files at several sizes, A4 and Letter. Render each sheet in print media, add the images through Image_Intake, download, compare bytes.
    - Test: `page.pdf()` in print media has exactly N pages of 210 x 297 mm or 215.9 x 279.4 mm, header "Page {p} of {N}", no tile clipped (P46, R10.8, R10.9) [Playwright].
    - Test: for each tested file all N sheets as images rebuild a byte-identical file with the same name and MIME; withholding the last sheet still completes (P47, R21.1, R21.2) [property].
    - _Requirements: 10.8, 10.9, 10.10, 10.11, 21.1, 21.2_
  - [ ] 2.8 Checkpoint: Group 2 stop-and-report
    - Run lint, typecheck, test, build, `test:e2e`, `test:fidelity`; report outputs and credits used against 153 (cap 184), cumulative 404. Stop. Rerun the whole e2e suite (all projects), not only the new tests.
    - _Requirements: 21.1_

- [ ] 3. Group 3: live camera receiver and screen stream sender (estimate 138, CAP 166)
  - [ ] 3.1 Camera and Frame_Loop (M, 15)
    - `camera.ts` (`getUserMedia`, error names to dispositions), `frame-loop.ts` (video frame to bitmap to the worker, drop while busy), release rules (tracks stopped on leave, restart, done, hide).
    - Test: with a mocked `getUserMedia`, denied, no-camera and generic failures map to `denied`, `nocam`, `camera` (R12.16, R12.17) [unit].
    - Test: tracks are stopped on route change, restart and completion (R12.18) [unit].
    - _Requirements: 5.7, 5.8, 12.9, 12.16, 12.17, 12.18_
  - [ ] 3.2 Receive timers, camera phases, ReceiveScreen camera path (L, 30)
    - `receive-timers.ts` on the `Clock` interface, `repeat` hold of REPEAT_HOLD_MS, `stall` after 20 s, `nothing` after 30 s, `dup`, `verify`, `failed`, restart resets counters; wire the camera into `ReceiveScreen`.
    - Test: for any outcome sequence on a fake clock, `stall` fires only after a first accepted Packet and 20 s without a new solved block, `nothing` only after 30 s without `found`, `stall` wins when both hold (P22, R12.19, R12.20, R12.21) [unit].
    - Test: restart sets all counters to 0 and releases the camera (R12.22) [unit].
    - _Requirements: 5.8, 12.19, 12.20, 12.21, 12.22, 12.23, 12.25, 5.17, 5.18, 5.19_
  - [ ] 3.3 Stream reducer, player and ticker (L, 30)
    - `stream.ts` reducer (events TOGGLE, NOTICE_BUTTON, TICK, NEXT, PREV, FPS, HIDDEN), `stream-player.ts` with `encoder.next()`, STEP_HISTORY 256, the ticker on `Clock` only, counter and lap formulas.
    - Test: for any event sequence `next()` yields 0, 1, 2, ... none skipped or repeated, the shown number equals a model, no illegal transition occurs (P13, R11.1, R11.2, R11.5, R11.6) [property].
    - Test: for any fps 2 to 15 on a fake clock, 10 s of `play` shows 10 x fps Packets within 1; an fps change applies from the next tick; the player reads no global time (P14, R11.3, R11.7) [unit].
    - Test: counter text, lap `floor((n - 1) / T) + 1`, `progress` value `min(n, K)` and aria labels match the formulas (P16, R3.4, R11.17) [unit].
    - _Requirements: 3.4, 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.17_
  - [ ] 3.4 StreamScreen: speed, size, pause, step, notice, reduced motion, full screen (L, 30)
    - `StreamScreen` container wires `StreamView` and `FullScreenView`: Speed range, size selector, pause and resume, Previous and Next in step, the Photosensitivity_Notice button, the reduced-motion default of `step`, full screen enter and exit, route guard without a file.
    - Test: with `prefers-reduced-motion: reduce` the initial mode is `step` and no timer runs (R3.9, R11.8) [unit].
    - Test: the notice button toggles the callout and the mode per the board (R3.13, R3.14) [unit].
    - Test: Next and Previous show exactly one Packet per activation and Previous is bounded by STEP_HISTORY (R11.9, R11.10) [unit].
    - Test: full-screen caption reads "Packet {n} of {K} + repair · Lap {L} · {fps} fps" (R3.15) [unit].
    - _Requirements: 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 3.16, 11.8, 11.9, 11.10, 11.11, 11.12_
  - [ ] 3.5 Screen-path end-to-end and receive scenarios (L, 30)
    - Project `camera`: Chromium with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture=<abs>/test-results/fake-camera/cam.y4m`. If the y4m path does not decode, use the design's fallback (feed the stage captures through the decode client) and report it.
    - Test: stepping the stream and feeding the stage captures rebuilds a byte-identical file (P48, R21.3) [property].
    - Test: scenarios reach `dup`, `failed`, `denied`, the `camera` panel, `nocam` (photos still complete a file), `stall`, `nothing`, counters at 0 after restart, `repeat` (P49, R21.4 to R21.9, R21.11) [Playwright].
    - _Requirements: 21.3, 21.4, 21.5, 21.6, 21.7, 21.8, 21.9, 21.10, 21.12_
  - [ ] 3.6 Checkpoint: Group 3 stop-and-report
    - Run lint, typecheck, test, build, `test:e2e`, `test:fidelity`; report outputs and credits used against 138 (cap 166), cumulative 542. Stop. Rerun the whole e2e suite (all projects), not only the new tests.
    - _Requirements: 21.3_

- [ ] 4. Group 4: PWA, delivery headers, privacy, bundle gate, README (estimate 101, CAP 121)
  - [ ] 4.1 Manifest and icons (M, 15)
    - `manifest.webmanifest`, `scripts/make-icons.mjs` (bundled Chromium, no new dependency), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, the 180 px `apple-touch-icon`, `theme-color` `#F7F5EF` equal in `index.html` and the manifest.
    - Test: manifest fields, icon sizes read from PNG IHDR, equal `theme-color` (P57, R14.1, R14.2) [unit].
    - _Requirements: 14.1, 14.2, 14.3_
  - [ ] 4.2 Hand-written service worker, build script, offline test (L, 30)
    - `scripts/build-sw.mjs` and `scripts/sw.template.js` generate `dist/app/sw.js` and `sw-manifest.json`, cache name from a content hash, no `skipWaiting`, registered after `load` in production only.
    - Test: the precache list equals the emitted files minus `sw.js`, maps and `.vite`; includes the `.wasm`, fonts, notices, manifest, icons; all same-origin; the cache name changes when any byte changes (P45, R14.4) [unit].
    - Test: after first load and activation, offline reload of all six routes, a send and an image decode produce zero failed requests (P43, R14.5, R14.6) [Playwright].
    - Test: a new `sw.js` stays `waiting`, `sw.js` has no `skipWaiting`, the running page keeps its assets (P44, R14.9) [Playwright].
    - _Requirements: 14.4, 14.5, 14.6, 14.7, 14.8, 14.9_
  - [ ] 4.3 `vercel.json` and header equality (M, 15)
    - `apps/strip/vercel.json` with the CSP, `Permissions-Policy` (camera on self) and other security headers from `SECURITY_HEADERS`; SPA rewrites that do not match assets.
    - Test: `APP_CSP`, the `vercel.json` values and the headers served by Vite dev, preview and the harness servers are equal strings for every header; rewrites do not match asset paths (P39, R15.1 to R15.7) [property].
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_
  - [ ] 4.4 Privacy: request log and storage inspection (M, 15)
    - Playwright flows over send, paper, stream, camera and images with `context.on("request")` and `serviceWorkers: "allow"`.
    - Test: over every flow the Request_Log holds only same-origin GET requests to paths in `sw-manifest.json`, none to Google Fonts, and no page-initiated `.wasm` request (P41, R16.1 to R16.3, R16.5) [property].
    - Test: after the flows `localStorage`, `sessionStorage`, cookies and IndexedDB are empty and every Cache API URL is in the precache list (P42, R16.4, R16.7) [Playwright].
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8_
  - [ ] 4.5 Notices and bundle report with the 400 KB gzip budget (M, 15)
    - `THIRD_PARTY_NOTICES` adds React, react-dom and IBM Plex (OFL); `scripts/bundle-report.mjs` writes `apps/strip/bundle-report.json` (gitignored; raw, gzip, brotli per asset, totals, first-load set) and fails over budget.
    - Test: first-load gzip set at most 400 KB, `.wasm` at most 1,000,000 bytes, report JSON exists with raw, gzip and brotli (P50, R18.1 to R18.3) [unit].
    - Test: notices include React, react-dom and IBM Plex with the OFL text (R19.10, R22.5) [unit].
    - Test: the Home board's notices link (`href="/THIRD_PARTY_NOTICES"`) is present, reachable and serves the notices file, in the app e2e suite against the production build (R15.5, R19.10) [Playwright].
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.6, 19.10, 22.5_
  - [ ] 4.6 README (S, 8)
    - Root `README.md`: what Strip is, run and test commands, the two paths, the limits, the privacy statement, the device-test pointer, third-party notices.
    - Test: README names every pnpm script it cites and each exists in a `package.json` (R22.7) [unit].
    - _Requirements: 22.7_
  - [ ] 4.7 Checkpoint: Group 4 stop-and-report
    - Run the CI order (lint, typecheck, test, build, `build:gallery`, test again, `test:e2e`, `test:fidelity`); report outputs, bundle numbers and credits used against 101 (cap 121), cumulative 643. Stop. Rerun the whole e2e suite (all projects), not only the new tests.
    - _Requirements: 18.1_

## CUT LINE

| Above the line (REQUIRED) | Groups 1 to 4 | 643 credits (limit 650) |
|---|---|---|
| Below the line (dropped first) | Group 5 | 86 credits; file total 729 (limit 800) |

Everything below this line is dropped first if the budget runs short.

- [ ] 5. Group 5 (BELOW THE CUT LINE): accessibility checks, reports, device-test hand-off (estimate 86, CAP 103)
  - [ ] 5.1 Accessibility checks (L, 30)
    - Keyboard-only run of a paper send, a screen send and every Receive button; focus lands on the main heading after navigation; no `outline: none` in shipped CSS; `prefers-reduced-motion` honoured; ARIA snapshots equal the boards.
    - Test: the keyboard-only run completes all three flows, focus moves to the heading, `outline: none` is absent, ARIA snapshots equal the boards (P55, R17.1 to R17.9) [Playwright].
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9_
  - [ ] 5.2 Lint-rule tests and violation sweep (M, 15)
    - Extend `tools/lint-rules.test.ts` for the new bans; add a console and `securitypolicyviolation` listener to every e2e flow.
    - Test: ESLint rejects `Math.random`, `Date.now`, `performance.now`, `new Date()` and `timeStamp` outside `src/clock`, deep package imports, `zod`, gallery imports, and `style` JSX except in `Ring` (P56, R22.1, R22.2, R22.6) [unit].
    - Test: every flow runs with zero `securitypolicyviolation` events and zero console errors; the built `index.html` has no inline script, style or `style=""` (P58, R15.8, R15.9) [Playwright].
    - _Requirements: 15.8, 15.9, 22.1, 22.2, 22.6, 22.7_
  - [ ] 5.3 Perf and measured reports (L, 30)
    - `pnpm perf` for the stream tick and encode and render time at T = 200; measured print module size; stage captures at DPR 1 and 2 for S, M, L; a long-task observer on the Frame_Loop.
    - Test: no main-thread long task over 50 ms is attributable to decoding while the Frame_Loop runs on the fixture video (P51, R12.4) [Playwright].
    - Test: median tick at v30 is reported and at most 33 ms; encode and render for T = 200 is reported (P52, R11.16, R18.5) [perf].
    - Test: printed module size in mm on A4 is reported and code width is at least 49.2 mm (P53, R10.9) [perf].
    - Test: stage captures at DPR 1 and 2 for S, M, L decode to the exact Packet; pass bar only for M and L at DPR 2 and L at 1 (P54, R11.15) [perf].
    - _Requirements: 10.9, 11.15, 11.16, 12.4, 18.5_
  - [ ] 5.4 Device-test hand-off (S, 8)
    - Update `docs/device-test.md` for the real receiver page: print a sheet, photograph it, the live camera path, the screen path, record device and result columns.
    - Test: a human runs the document on a phone and records the results (R21.12) [manual].
    - _Requirements: 21.12_
  - [ ] 5.5 Checkpoint: Group 5 stop-and-report
    - Run the full CI order; report outputs and credits used against 86 (cap 103), cumulative 729. Stop. Rerun the whole e2e suite (all projects), not only the new tests.
    - _Requirements: 17.1_

## Notes

- Costs use the scale S = 8, M = 15, L = 30; a checkpoint is 3. Group estimates: 1 = 251, 2 = 153, 3 = 138, 4 = 101, 5 = 86. Caps are the estimate plus 20%: 301, 184, 166, 121, 103.
- Deviation from the requested order: the README (4.6) sits in Group 4 above the cut line so the submission is complete; Group 5 holds accessibility checks, reports and the device-test hand-off.
- Group 1 commits the 53 fidelity targets incrementally. A target without a converted component is skipped with a named reason, and the conversion task that delivers it removes the skip.
- Criteria dropped if the CUT LINE tasks are cut: R17.1 to R17.9 (only the ARIA parity covered by DOM parity in Group 1 remains), R22.1 and R22.2 rule-by-rule lint tests (the lint rules still run), R22.6 test, R15.8 and R15.9 sweep (the built `index.html` check in 1.2 and header equality in 4.3 remain), R12.4, R10.9, R11.15, R11.16, R18.5, and the R21.12 device-test record.

## Property split

Kept as property (17): P1, P2, P9, P13, P17, P18, P21, P23, P26, P29, P30, P35, P36, P39, P41, P47, P48. Properties that iterate over generated or enumerated inputs in Playwright (P35, P36, P39, P41, P47, P48) are the "property-style Playwright check".

| Property | Treatment | Sub-task |
|---|---|---|
| P1 | kept as property | 2.2 |
| P2 | kept as property | 2.1 |
| P3 | unit test | 2.1 |
| P4 | unit test | 2.6 |
| P5 | unit test | 2.1 |
| P6 | unit test | 2.1 |
| P7 | unit test | 2.2 |
| P8 | unit test | 2.2 |
| P9 | kept as property | 2.2 |
| P10 | unit test | 2.2 |
| P11 | unit test | 1.7 |
| P12 | unit test (Playwright) | 1.7 |
| P13 | kept as property | 3.3 |
| P14 | unit test | 3.3 |
| P15 | unit test | 1.10 |
| P16 | unit test | 3.3 |
| P17 | kept as property | 1.3 |
| P18 | kept as property | 1.3 |
| P19 | unit test | 1.3 |
| P20 | unit test | 1.3 |
| P21 | kept as property | 2.5 |
| P22 | unit test | 3.2 |
| P23 | kept as property | 2.5 |
| P24 | unit test | 1.12 |
| P25 | unit test | 2.2 |
| P26 | kept as property | 2.5 |
| P27 | unit test | 2.6 |
| P28 | unit test | 2.6 |
| P29 | kept as property | 2.4 |
| P30 | kept as property | 2.4 |
| P31 | unit test | 2.4 |
| P32 | unit test | 1.12 |
| P33 | unit test | 1.13 |
| P34 | unit test | 2.5 |
| P35 | kept as property | 1.6 (targets added in 1.8 to 1.13) |
| P36 | kept as property | 1.6 (targets added in 1.8 to 1.13) |
| P37 | unit test | 1.4 |
| P38 | unit test | 1.4 |
| P39 | kept as property | 4.3 |
| P40 | unit test | 1.7 |
| P41 | kept as property | 4.4 |
| P42 | unit test (Playwright) | 4.4 |
| P43 | unit test (Playwright) | 4.2 |
| P44 | unit test (Playwright) | 4.2 |
| P45 | unit test | 4.2 |
| P46 | unit test (Playwright) | 2.7 |
| P47 | kept as property | 2.7 |
| P48 | kept as property | 3.5 |
| P49 | unit test (Playwright) | 3.5 |
| P50 | unit test | 4.5 |
| P51 | dropped (below cut line) | 5.3 |
| P52 | dropped (below cut line) | 5.3 |
| P53 | dropped (below cut line) | 5.3 |
| P54 | dropped (below cut line) | 5.3 |
| P55 | dropped (below cut line) | 5.1 |
| P56 | dropped (below cut line) | 5.2 |
| P57 | unit test | 4.1 |
| P58 | dropped (below cut line) | 5.2 |

## Requirements traceability

| Requirement | Sub-tasks | Dropped if the cut line is cut |
|---|---|---|
| R1 Home | 1.3, 1.7, 1.8 | none |
| R2 Send step 1 | 1.9, 2.1, 2.2 | none |
| R3 Send on screen | 1.10, 3.3, 3.4 | none |
| R4 Send on paper | 1.11, 2.2, 2.3 | none |
| R5 Receive screen | 1.12, 2.5, 3.1, 3.2 | none |
| R6 About | 1.13 | none |
| R7 Error states | 1.7, 1.13, 2.6 | none |
| R8 Shell and routing | 1.2, 1.3 | none |
| R9 Limits and intake | 1.2, 2.1, 2.2, 2.3, 2.6 | none |
| R10 Paper pipeline | 2.2, 2.3, 2.7 | R10.9 print module size (5.3) |
| R11 Screen pipeline | 3.3, 3.4 | R11.15, R11.16 (5.3) |
| R12 Receiver pipeline | 2.4, 2.5, 3.1, 3.2 | R12.4 long task (5.3) |
| R13 Error mapping | 2.6 | none |
| R14 PWA | 4.1, 4.2 | none |
| R15 CSP and headers | 1.2, 4.3, 5.2 | R15.8, R15.9 sweep (5.2) |
| R16 Privacy | 4.4 | none |
| R17 Accessibility | 1.2, 5.1 | R17.1 to R17.9 (keyboard run), ARIA parity remains |
| R18 Performance and bundle | 4.5, 5.3 | R18.5 (5.3) |
| R19 Design hand-off | 1.3, 1.4, 1.5, 1.7, 1.8 to 1.13, 4.5 | none |
| R20 Fidelity gate | 1.5, 1.6, 1.7, 1.8 to 1.13 | none |
| R21 End-to-end | 2.2, 2.5, 2.7, 3.5, 5.4 | R21.12 device record (5.4) |
| R22 Dependencies, boundaries, purity | 1.1, 1.2, 1.5, 4.5, 4.6, 5.2 | R22.1, R22.2, R22.6, R22.7 rule tests (5.2) |

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4"] },
    { "id": 2, "tasks": ["1.3", "1.5"] },
    { "id": 3, "tasks": ["1.6"] },
    { "id": 4, "tasks": ["1.7"] },
    { "id": 5, "tasks": ["1.8"] },
    { "id": 6, "tasks": ["1.9"] },
    { "id": 7, "tasks": ["1.10"] },
    { "id": 8, "tasks": ["1.11"] },
    { "id": 9, "tasks": ["1.12"] },
    { "id": 10, "tasks": ["1.13"] },
    { "id": 11, "tasks": ["2.1", "2.2", "2.4"] },
    { "id": 12, "tasks": ["2.3", "2.5"] },
    { "id": 13, "tasks": ["2.6"] },
    { "id": 14, "tasks": ["2.7"] },
    { "id": 15, "tasks": ["3.1", "3.3"] },
    { "id": 16, "tasks": ["3.2", "3.4"] },
    { "id": 17, "tasks": ["3.5"] },
    { "id": 18, "tasks": ["4.1", "4.3"] },
    { "id": 19, "tasks": ["4.2", "4.4"] },
    { "id": 20, "tasks": ["4.5", "4.6"] },
    { "id": 21, "tasks": ["5.1", "5.2", "5.4"] },
    { "id": 22, "tasks": ["5.3"] }
  ]
}
```
