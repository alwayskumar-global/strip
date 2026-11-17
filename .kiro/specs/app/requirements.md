# Requirements Document

## Introduction

Strip is a client-side PWA, sender and receiver in one app, that turns a file into a printable strip (paper path, primary: the 1985 Cauzin Softstrip idea rebuilt) or an animated on-screen code sequence (screen path), and rebuilds the file from a phone camera or from photos and scans of the printed pages. This spec covers `apps/strip` (`@strip/app`): every screen, the sender and receiver pipelines, the PWA shell, the delivery headers, privacy, accessibility, performance gates and the design fidelity gate. It does not restate the codec (`@strip/codec`, spec `.kiro/specs/codec`) or the symbols package (`@strip/symbols`, spec `.kiro/specs/symbols`); it consumes their public barrels, plus the one documented `@strip/symbols/wasm-url` subpath.

Everything runs client-side. There is no backend, no account, no network use at runtime (after the first load, one same-origin request set only), no encryption in v1, no native app and no cloud service. The dependency direction `codec <- symbols <- app` is unchanged.

The source of every screen is the design folder `design/project` (17 `*.dc.html` boards and `strip.css`). The boards are converted to React components, keeping class names, text, element structure and ARIA text (steering: design-handoff). The boards carry mock numbers (96 packets, 27 codes, 3 pages, 184 KB) that the real codec and symbols values contradict; the app computes every number and keeps the board's text templates verbatim (Appendix C lists each conflict). Every decision taken by the user is recorded under Resolved questions. Requirements refer to decided values by a named constant (for example FILE_CAP_BYTES) so that each value has one definition. Work that other specs must do first is listed under Dependencies on other work.

Each acceptance criterion ends with a tag naming how it is verified: [unit] (fast example or table test in `pnpm test`), [property] (fast-check property in `pnpm test`), [measured] (seeded or batch run outside the fast suite), [perf] (perf script), [Playwright] (bundled Chromium test against a localhost harness or the production build) and [manual] (recorded human check).

## Glossary

- **App**: The package `@strip/app` in `apps/strip`, the PWA.
- **Board**: One `*.dc.html` file in `design/project`. Main.dc.html is the design-system board and is not a screen.
- **Stylesheet**: `design/project/strip.css`. Shipped as a copy that is byte-identical to the design file; never edited or appended to (Resolved question 17).
- **Fonts_Stylesheet**: The sibling file `fonts.css`, in the directory that holds the shipped copy of the Stylesheet, containing only the `@font-face` rules of the self-hosted IBM Plex families.
- **Additions_Stylesheet**: The sibling file `strip-additions.css`, in the same directory, containing every rule the App needs beyond the Stylesheet (the approved additions of Resolved question 15 and the `body { margin: 0 }` rule). Each rule is listed as an addition in the task report.
- **Route**: A URL path served by the App. The routes are in Appendix A (Resolved question 21).
- **Home_View**, **Send_View**, **Stream_View**, **Paper_View**, **Receive_View**, **About_View**: The App views for Home, Send step 1, Send on screen, Send on paper, Receive and About.
- **Error_Panel**: The App component converted from ErrorState.dc.html, with the prop `kind` of `size`, `camera` or `stall` (the board kinds) or `nocamera`, `format`, `filename`, `draw`, `reader`, `unexpected` or `limit` (the added kinds of Requirement 7, criteria 10 to 12).
- **Receive_Phase**: One of `ask`, `denied`, `scan`, `dup`, `verify`, `done`, `failed`, the values of the prop `phase` of ReceiveState.dc.html.
- **Sender_File**: The one file chosen on Send_View: bytes held in memory, name, MIME type and size.
- **FILE_CAP_BYTES**: The maximum Sender_File size in bytes. The value is 262,144 (256 KB; the board's KB is 1024 bytes, as 184 KB is 188,416 bytes; Resolved question 10).
- **PAPER_WARN_BYTES**: 65,536 (64 KB). A Sender_File above this size shows the paper warning (Requirement 9, criterion 8).
- **Default_Cell**: The symbols default cell: version 30, ECC_Level L, packet size 1732 bytes, minimum 4 pixels per module (`QR_DEFAULTS`).
- **K**: The codec block count of the Sender_File's Encoder. **T**: The count of codes on paper, `K + R(K)`, the length of `page()`.
- **PER_PAGE**: The number of codes on one printed page. The board grid is 3 columns by 3 rows, so PER_PAGE is 9 (Resolved question 14).
- **Tile**: One code with its caption on a printed page (`figure.tile`).
- **Print_Sheet**: One `article.paper` element, A4 (210 mm by 297 mm) in print.
- **Stream_Player**: The App logic that calls `encoder.next()` on a timer and shows each Packet as one code.
- **FPS_MIN, FPS_MAX, FPS_DEFAULT**: 2, 15 and 8, the `min`, `max` and `value` of the Speed range in SendScreen.dc.html.
- **Frame_Loop**: The App camera loop: video frame to canvas to the decode worker, with at most one decode in flight.
- **Decode_Worker**: The same-origin module worker `apps/strip/src/decode.worker.ts` that owns the symbols Frame_Decoder, spoken to through `decode-client.ts` and the message protocol in `decode-protocol.ts` (messages `init`, `frame`, `bitmap`, replies `ready`, `init-error`, `outcome`, `error`).
- **Terms from the other specs**: Packet, Metadata, Metadata_Record, Session_Id, Encoder, Decoder, Ignore_Reason and ErrorCode (codec spec); Symbol_Matrix, Quiet_Zone, Frame_Decoder, SymbolError, Perf_Method and Reference_Machine (symbols spec). They keep their meaning there.
- **Image_Intake**: The App input for image files (photos or scans of printed pages), added incrementally (not in the design; approved addition, Resolved question 15).
- **IMAGE_MAX_FILE_BYTES**, **IMAGE_MAX_COUNT**, **IMAGE_MAX_PIXELS**, **IMAGE_LONG_SIDE**: 26,214,400 (25 MB, with the board's 1024-byte KB), 100, 16,777,216 (4096 × 4096) and 4096 (Resolved question 12).
- **Multi_Symbol_Read**: The `@strip/symbols` capability to return every symbol found in one image. Its option name and result shape are defined by the symbols spec amendment (dependency D2), cited here by its id once the amendment exists.
- **Scan_Session**: One codec Decoder instance plus the App counters (packets seen, packets skipped from other sessions, time of the last new block).
- **Session_Short**: The display form of the codec Session_Id (the first 4 uppercase hexadecimal digits of the Session_Id, or all 8 digits of each when two forms in view would be equal; Resolved question 19).
- **STALL_TIMEOUT_MS**: 20000, the "20 seconds" of the stall board.
- **App_CSP**: The Content Security Policy the App delivers: the symbols Strip_CSP plus `worker-src 'self'` (Requirement 15, criterion 1).
- **Strip_CSP**: The symbols CSP string of symbols Requirement 9, criterion 3, exported as `STRIP_CSP` from `apps/strip/src/csp.ts`.
- **Request_Log**: The list of every network request (including service worker and worker requests) recorded by a Playwright test.
- **Harness_Build**: The localhost test build of the App that includes the dev and test-only gallery routes. The production bundle contains no gallery route.
- **Fidelity_Gate**: The Playwright screenshot-diff test of Requirement 20.
- **Baseline**: The reference screenshot rendered from the original design HTML in Chromium.
- **QR_Mask**: A rectangle painted over every code region (`svg.code`, `.stage__code`, `.vf__code`, the viewfinder video) in both Baseline and App screenshot before diffing.
- **Template_Construct**: A Claude-Design template construct: `{{ }}`, `sc-for`, `sc-if`, `dc-import`, `x-dc`, `helmet`, `data-dc-script` component classes (DCLogic), `hint-*` attributes.
- **Bundle_Report**: The build output listing every emitted asset with raw, gzip and brotli sizes and the totals.
- **First_Load_Budget**: The transfer budget of Requirement 18, criterion 2: 400 KB gzip, to be revisited after the first Bundle_Report (Resolved question 26).
- **THIRD_PARTY_NOTICES**: The static file `apps/strip/public/THIRD_PARTY_NOTICES` of symbols Requirement 15.
- **REPO_URL**: `https://github.com/alwayskumar-global/strip` (Resolved question 23).
- **Photosensitivity_Notice**: The `callout callout--warn` shown on Stream_View (Requirement 3, criterion 13).
- **Step_Mode**: The Stream_View mode in which the Stream_Player shows exactly the next Packet per activation of the Step control and never advances on a timer.

## Requirements

### Requirement 1: Home screen (route `/`)

**User Story:** As a first-time visitor, I want to see what Strip does and pick Send or Receive in one tap, so that I reach the right flow without reading anything else.

#### Acceptance Criteria

1. WHEN the route `/` is requested, THE App SHALL render Home_View converted from Home.dc.html with the board's class names, element structure, text and ARIA text, and with no nav link carrying `aria-current`. [Playwright]
2. THE Home_View SHALL contain, verbatim from Home.dc.html: the label "No network · No account · No upload", the heading "Move a file between devices with just light.", the lead paragraph, the Send card (link to `/send`, label "I have a file", heading "Send", action "Choose a file"), the Receive card (link to `/receive`, label "I see a code", heading "Receive", action "Open camera"), the "How it works" list with steps "Pick a file", "Show the code" and "Scan it", and the footer text "Built with Kiro". [Playwright]
3. THE Home_View SHALL render the specimen figure with 6 codes produced by `encodeSymbol` from 6 real codec Packets of a fixed built-in sample payload at the Default_Cell, in place of the mock codes of codegen.js, keeping the specimen head "field-notes-2026.pdf", "Page 1 / 3" and the caption "Sample strip · 6 of 9 codes shown" as static sample text (Resolved question 15). [unit]
4. FOR ALL 6 specimen codes, rasterizing the code at 4 pixels per module and decoding it with `decodeFrame` SHALL return a Packet that `decodePacket` accepts. [Playwright]
5. THE Home_View footer SHALL link "About & privacy" to `/about` and "GitHub" to REPO_URL, with `rel="noopener"`; the link is a navigation, not a fetch. [unit]
6. WHILE the container width of `.page` is at most 760 px, THE Home_View SHALL use the layout rules of the Stylesheet container query `@container page (max-width: 760px)`, and THE root class `page--m` SHALL be used only by the Harness_Build for the mobile Fidelity_Gate target. [Playwright]
7. THE Home_View SHALL have a single state and SHALL request no network resource other than the App's own assets. [Playwright]

### Requirement 2: Send step 1 screen (route `/send`)

**User Story:** As a sender, I want to choose a file and an output, so that I know the size, hash and cost (codes, pages, loop time) before I show or print it.

#### Acceptance Criteria

1. WHEN the route `/send` is requested, THE App SHALL render Send_View converted from Send.dc.html with the board's class names, structure, text and ARIA text: crumbs "1 File & output" (`aria-current="step"`) and "2 Show or print", heading "Send a file", the drop section, the file card, the output fieldset and the action bar. [Playwright]
2. WHEN the user drops a file on the drop section or chooses a file with `input#file`, THE App SHALL read the file into memory as the Sender_File and SHALL use only the first file when several are given. [Playwright]
3. THE Send_View SHALL show the drop-zone hint "Max {cap} KB · one file", where {cap} is FILE_CAP_BYTES divided by 1024. [unit]
4. WHILE a Sender_File is set, THE Send_View SHALL show the file card with: the file name (`h2.filecard__name`), the MIME type, a "Remove file" button, the row "Size" as "{n} KB" followed by "{bytes} bytes" with thousands separators (for 188,416 bytes: "184 KB" and "188,416 bytes"), the row "SHA-256" as the first 12 hexadecimal digits in 3 groups of 4 followed by "…", the row "Within limit" as "{n} of {cap} KB", and a `progress` with `value` n, `max` cap and the label "Share of the 256 KB limit used" (the number computed from FILE_CAP_BYTES). [unit]
5. THE Send_View SHALL compute the SHA-256 shown in the file card with the codec export `sha256WebCrypto`, the same function the codec uses, so that the chip equals the hash in the Metadata_Record. [property]
6. WHEN the user activates "Remove file", THE App SHALL drop every reference to the Sender_File bytes and return to the empty state. [unit]
7. WHEN a Sender_File is set, THE Send_View SHALL create a codec Encoder with packetSize 1732 and SHALL show the Screen choice line "{K} packets + repair · ≈ {s} s loop at 8 fps", where {s} is T divided by FPS_DEFAULT, rounded to an integer (the board shows "96 packets + repair · ≈ 15 s loop at 8 fps"), and the Paper choice line "{T} codes · {P} pages · black on white", where P is `ceil(T / PER_PAGE)`. [property]
8. THE Send_View SHALL offer the radio group `name="output"` with values `screen` (checked by default) and `paper`, each with the board's heading and description text. [Playwright]
9. WHEN the user activates the primary action with `screen` selected, THE App SHALL navigate to `/send/screen`, and with `paper` selected, THE App SHALL navigate to `/send/paper`, and THE primary action label SHALL be "Continue to Screen" or "Continue to Paper" (the Paper label derives from the board's pattern; Resolved question 15). [Playwright]
10. THE Send_View SHALL link the secondary action "Cancel" to `/`. [unit]
11. IF the Sender_File size exceeds FILE_CAP_BYTES, THEN THE Send_View SHALL show the Error_Panel with kind `size` (Requirement 7), SHALL NOT read the file bytes into memory, and SHALL NOT enable the primary action. [Playwright]
12. WHEN a file of exactly FILE_CAP_BYTES bytes is chosen, THE App SHALL accept it, and WHEN a file of FILE_CAP_BYTES + 1 bytes is chosen, THE App SHALL show the Error_Panel kind `size`. [unit]
13. WHILE no Sender_File is set, THE Send_View SHALL show the drop section and no file card, and SHALL disable the primary action (the empty and drag-over states are not in the design; Resolved question 15). [Playwright]
14. IF File.type is empty or is not a valid codec MIME type (longer than 127 bytes or containing a byte above 0x7F), THEN THE App SHALL use the MIME type `application/octet-stream`. [property]
15. WHILE the container width of `.page` is at most 760 px, THE Send_View SHALL use the Stylesheet container query layout, and THE `page--m` root class SHALL be used only by the Harness_Build. [Playwright]

### Requirement 3: Send on screen (route `/send/screen`)

**User Story:** As a sender in the same room as the receiver, I want an animated code that I can pause, speed up or enlarge, so that a phone can read the file from my screen.

#### Acceptance Criteria

1. WHEN the route `/send/screen` is requested while a Sender_File is set, THE App SHALL render Stream_View converted from SendScreen.dc.html with the board's class names, structure, text and ARIA text: the back link `aria-label="Back to file and output"` (to `/send`), the heading "Show on screen", the tag "{name} · {size} KB", the stage, the transport panel, the speed field, the code size fieldset the tip callout "Hold the phone steady" and the Photosensitivity_Notice (an approved addition, criterion 13). [Playwright]
2. WHEN the route `/send/screen` is requested while no Sender_File is set, THE App SHALL navigate to `/send`. [Playwright]
3. THE Stream_View SHALL render each Packet as the board's `svg.code` (class, `viewBox`, `shape-rendering="crispEdges"`, `role="img"`, `rect.code__bg`, `path.code__ink`) whose module geometry comes from `encodeSymbol` and `renderToSvg` of the Symbols_Package (Requirement 11), with the `aria-label` "Animated data code, packet {n} of {K}" and the stage `aria-label` "Animated code, frame {n}". [Playwright]
4. THE Stream_View SHALL show the counter as the label "Packet", the number {n} and the text "of {K} + repair", where {n} is the sequence number plus 1, and a `progress` with `value` min({n}, K), `max` K and the label "Packet progress". [unit]
5. THE Stream_View counter SHALL keep `aria-live="off"`. [unit]
6. THE Stream_View SHALL show the transport button "Pause" with the key hint "Space" while playing, and the text "After packet {K} the code keeps looping repair packets until you stop. A scanner can start at any point." [unit]
7. WHEN the user activates the Pause button, or presses Space while focus is not on another interactive control, THE Stream_View SHALL hold the current code and SHALL show the label "Play" in place of "Pause" (the paused state is not in the design; Resolved question 15). [Playwright]
8. THE Stream_View SHALL offer the Speed range `input#fps` with `min` FPS_MIN, `max` FPS_MAX, `step` 1 and initial value FPS_DEFAULT, the value text "{n} fps", the label "Speed" and the help "Drop to 4–6 fps if the receiver skips frames.". [unit]
9. THE Stream_View SHALL offer the radio group `name="size"` with values `s`, `m` (checked by default) and `l`, labelled "Small", "Medium" and "Large", applying the Stylesheet classes `stage__code--s` and `stage__code--l` and no class for `m`. [Playwright]
10. THE Stream_View stage SHALL keep a white (#FFF) background and SHALL place nothing over the code. [Playwright]
11. WHILE the container width of `.page` is at most 760 px, THE Stream_View SHALL use the Stylesheet container query layout, and THE `page--m` root class SHALL be used only by the Harness_Build. [Playwright]
12. THE Stream_View playback engine, full-screen mode and reduced-motion behaviour SHALL meet Requirement 11. [Playwright]
13. THE Stream_View SHALL show the Photosensitivity_Notice above the stage in every state of the stream, using the `callout callout--warn` markup (title and text elements) of the `dup` banner of ReceiveState.dc.html, with the title "Flashing image" and the text "This code changes between black and white up to {FPS_MAX} times a second. If flashing images bother you, pause it or step through it one packet at a time, or print a strip instead." ({FPS_MAX} computed, 15 today). The copy is derived, not from the board. [Playwright]

### Requirement 4: Send on paper (route `/send/paper`)

**User Story:** As a sender who wants a durable copy, I want a print preview of the strip and a print button, so that a phone can read the file from paper now or years later.

#### Acceptance Criteria

1. WHEN the route `/send/paper` is requested while a Sender_File is set, THE App SHALL render Paper_View converted from SendPaper.dc.html with the board's class names, structure, text and ARIA text: the back link `aria-label="Back to file and output"` (to `/send`), the heading "Print a strip", the tag "{name} · {size} KB", the setup panel (`aria-label="Print setup"`) and the paper preview. [Playwright]
2. WHEN the route `/send/paper` is requested while no Sender_File is set, THE App SHALL navigate to `/send`. [Playwright]
3. THE Paper_View setup panel SHALL show the radio group `name="paper"` with values `a4` (checked by default) and `letter`, labelled "A4" and "Letter". [Playwright]
4. THE Paper_View SHALL show the "Preview page" value "{p} / {N}" and the buttons `aria-label="Previous page"` and `aria-label="Next page"`, where the previous button is `disabled` on page 1 and the next button is `disabled` on page N. [Playwright]
5. THE Paper_View SHALL show the row "Codes" as "{T} · {PER_PAGE} per page · includes repair" and the row "SHA-256" as the chip of Requirement 2, criterion 4. [unit]
6. THE Paper_View SHALL show the primary button "Print {N} pages" and the callout "Print at 100%" with the board's text. [unit]
7. THE Paper_View preview SHALL be an `article.paper` with `aria-label="Page {p} of {N} preview"`, four registration marks, the header, the grid of tiles and the footer, where each tile is a `figure.tile` with the board's `svg.code` structure (Requirement 3, criterion 3), the caption label "P{p}·{ii}" ({ii} the 2-digit position on the page) and the caption "{g}/{T}" ({g} the 1-based index of the Packet in `page()` order), and the tile's `aria-label` is the caption label. [Playwright]
8. THE Paper_View header SHALL show the file name (`.paper__name`), the meta line "{n} KB · SHA-256 {12 hex digits}… · {T} codes", the page text "PAGE {p} / {N}", and the Session_Short (Requirement 10, criterion 6). [Playwright]
9. THE Paper_View footer SHALL show "STRIP · PRINT AT 100% · BLACK ON WHITE" and the ruler with the text "10 cm". [unit]
10. WHEN the user activates the print button, THE App SHALL call `window.print()` on the same window and SHALL show all N Print_Sheets to the printer (Requirement 10, criterion 8). [Playwright]
11. WHILE the container width of `.page` is at most 760 px, THE Paper_View SHALL use the Stylesheet container query layout, and THE `page--m` root class SHALL be used only by the Harness_Build. [Playwright]
12. THE Paper_View pipeline (page count, layout, print CSS, module size) SHALL meet Requirement 10. [Playwright]

### Requirement 5: Receive screen (route `/receive`)

**User Story:** As a receiver, I want to point my phone at a strip or a screen, or add photos of printed pages, and watch the file rebuild, so that I get the file only when its hash matches.

#### Acceptance Criteria

1. WHEN the route `/receive` is requested, THE App SHALL render Receive_View: the page nav and the `section.strip.rx` converted from ReceiveState.dc.html (back link `aria-label="Back to home"`, heading "Receive", viewfinder `.vf`, status `role="status"`, ring, stats `aria-live="polite"`, dock), with the board's class names, structure, text and ARIA text, in the initial Receive_Phase `ask`. [Playwright]
2. THE Receive_View SHALL show, for each Receive_Phase, the tag, tag class, heading, message, primary button text and class, secondary button text, HUD text, viewfinder class, banner and ring state listed in Appendix D, verbatim, with the board's mock numbers replaced by computed values. [unit]
3. WHEN the user activates "Allow camera" in the phase `ask`, THE App SHALL call `getUserMedia` (and SHALL NOT call it on page load); on success it SHALL enter `scan`, and on a permission refusal it SHALL enter `denied`. [Playwright]
4. WHILE the Receive_Phase is `denied`, THE Receive_View SHALL show the three steps "Open the site settings from the address bar.", "Set Camera to Allow." and "Return here and tap Try again.", and "Try again" SHALL request the camera again. [Playwright]
5. WHILE the Receive_Phase is `scan` or `dup`, THE Receive_View SHALL show the torch button `aria-label="Torch"` only when the camera track reports the `torch` capability. [Playwright]
6. WHEN the Scan_Session counts a packet ignored with reason SESSION_MISMATCH while the Receive_Phase is `scan`, THE App SHALL enter `dup`, showing the HUD "Session {A} ≠ {B}" ({A} the foreign Session_Short, {B} the current one) and the message "Still solving the first file. {n} packets from another session were skipped." with {n} the count of skipped packets. [Playwright]
7. WHEN the user activates "Keep current file" in `dup`, THE App SHALL return to `scan` and SHALL NOT re-enter `dup` for the same foreign session, and WHEN the user activates "Switch to new", THE App SHALL create a new Scan_Session and return to `scan`. [Playwright]
8. WHEN the Decoder reports `complete`, THE App SHALL read `result()`, enter `done`, show the file name, the size and "SHA-256 match · {12 hex digits}…" in the viewfinder, and make "Save file" download the file (Requirement 12, criterion 9). [Playwright]
9. IF the Decoder returns `rejected` with HASH_MISMATCH, THEN THE App SHALL enter `failed`, SHALL NOT offer any download, SHALL keep no payload bytes, and SHALL show in the `callout--error` banner the text "Expected {e1} {e2} {e3}…, got {a1} {a2} {a3}…", where {e1} to {e3} are the first 12 hexadecimal digits of the expected SHA-256 and {a1} to {a3} those of the actual SHA-256, in 3 groups of 4 (lowercase, as the board), read from the Decoder (dependency D1). [Playwright]
10. WHEN the user activates "Scan again", "Discard", "Receive another", "Start over" or "Cancel", THE App SHALL create a new Scan_Session (the codec Decoder is terminal after a rejection) and SHALL set the Receive_Phase to the target in Appendix D. [unit]
11. WHEN the user activates "Stop scanning" in `scan`, THE App SHALL stop every camera track and return to `ask`. [Playwright]
12. THE Receive_View SHALL include a control to add image files (Requirement 12, criterion 10), which is not in the design (Resolved question 15). [Playwright]
13. IF the stall condition of Requirement 12, criterion 12 occurs, THEN THE Receive_View SHALL show the Error_Panel kind `stall` (Requirement 7). [Playwright]
14. THE Receive_View in the Harness_Build SHALL be reachable for each of the 7 Receive_Phases through the gallery route of Resolved question 21, rendering ReceiveStates.dc.html's 7 cells. [Playwright]
15. WHILE the viewport is 390 px wide, THE Receive_View SHALL use the Stylesheet `rx` container layout, and WHILE the `rx` container is at least 880 px wide, THE Receive_View SHALL use the two-column layout `@container rx (min-width: 880px)`. [Playwright]

### Requirement 6: About screen (route `/about`)

**User Story:** As a cautious user, I want to read what Strip does with my file and what it does not do, so that I can trust it with a document.

#### Acceptance Criteria

1. WHEN the route `/about` is requested, THE App SHALL render About_View converted from About.dc.html with the board's class names, structure, text and ARIA text, with `aria-current="page"` on the About nav link. [Playwright]
2. THE About_View SHALL contain, verbatim: the heading "Nothing leaves this device.", the sections `#privacy`, `#account`, `#caveat` ("Strip does not encrypt"), `#limits` and `#credits`, and the table of contents `nav[aria-label="On this page"]` linking to those five ids. [Playwright]
3. THE About_View "Max file size" row SHALL show FILE_CAP_BYTES divided by 1024 followed by " KB", and every other Limits row SHALL keep the board text. [unit]
4. WHEN a user opens `/about#limits`, THE App SHALL scroll the `#limits` section into view. [Playwright]
5. THE About_View SHALL link "GitHub" (credits button and footer) to the repository URL of Resolved question 23 with `rel="noopener"`, and "Send a file" to `/send`. [unit]
6. THE statements "No upload, no server copy, no share link" and "Once the page has loaded, Strip does not need a connection to send or receive" SHALL be true of the shipped App, proved by Requirement 16, criteria 1 and 2 and Requirement 14, criterion 5. [Playwright]
7. WHERE THIRD_PARTY_NOTICES is linked from the App (symbols Requirement 15, criterion 5), THE link SHALL be reachable from About_View (the board has no such link; Resolved question 15). [Playwright]
8. WHILE the container width of `.page` is at most 760 px, THE About_View SHALL use the Stylesheet container query layout, and THE `page--m` root class SHALL be used only by the Harness_Build. [Playwright]

### Requirement 7: Error states (Error_Panel and the Errors board)

**User Story:** As a user who hits a limit or a failure, I want the app to say what happened, show the numbers and offer one next step, so that I am never shown a raw error code.

#### Acceptance Criteria

1. THE App SHALL implement Error_Panel from ErrorState.dc.html as an inline component (`section.strip.err`, `role="alert"`) with the prop `kind` of `size`, `camera`, `stall`, `nocamera`, `format`, `filename`, `draw`, `reader`, `unexpected` or `limit`, and SHALL NOT give it a route in the production bundle. [unit]
2. WHERE kind is `size`, THE Error_Panel SHALL show the tag "File too large", the title "This file is too big for Strip", the message "{name} is {size}. Strip carries files up to {cap} KB. Compress it, or split it into smaller files.", the rows "File", "Size" and "Limit", a `progress.progress--signal` (`value` 100, `max` 100, label "File size is over the limit"), the meter ends "{cap} KB limit" and "{size} file", and the actions "Choose another file" (to `/send`) and "About limits" (to `/about#limits`). [unit]
3. WHERE kind is `camera` (shown only when `navigator.mediaDevices` or `getUserMedia` is absent, never for a missing camera device), THE Error_Panel SHALL show the tag "Camera unavailable", the title "This browser can’t use the camera", the message of ErrorState.dc.html, the rows "Camera API" ("Missing" or "Present"), "Secure context" ("Yes (HTTPS)" or "No") and "Send" ("Available"), and the actions "Open Send" (to `/send`) and "Copy page link" (copies the page URL to the clipboard). [Playwright]
4. WHERE kind is `stall`, THE Error_Panel SHALL show the tag "Decode stalled", the title "No progress for {STALL_TIMEOUT_MS / 1000} seconds", the message "{solved} of {total} blocks are solved. The remaining blocks need packets the camera has not read cleanly yet.", the small ring with the computed percent, the text "Frozen at {solved} / {total}", the rows "Blocks solved" ("{solved} / {total}"), "Packets seen" and "Last new block" ("{s} s ago"), the three tips of ErrorState.dc.html, and the actions "Keep scanning" and "Start over". [unit]
5. THE Error_Panel SHALL compute the ring arc `d` from the percent with the same pure function as the Receive ring (`M50 6A44 44 0 …`), with percent 100 drawn as the full-circle path of ReceiveState.dc.html. [property]
6. WHEN the user activates "Keep scanning" in the stall panel, THE App SHALL return to `scan` with the Scan_Session unchanged and the stall timer restarted, and WHEN the user activates "Start over", THE App SHALL create a new Scan_Session. [Playwright]
7. WHERE the Errors board is rendered by the Harness_Build gallery route, THE Harness_Build SHALL render the three kinds with the board's sample values (Resolved question 21). [Playwright]
8. THE App SHALL show an Error_Panel, or the Receive_View banner, for each error disposition of Requirement 13 and SHALL NOT show any raw error code string. [Playwright]
9. THE Fidelity_Gate SHALL cover the Errors board at 1280 px (desktop) and 390 px (mobile) and each Error_Panel kind (Requirement 20, criterion 1), using the Stylesheet rules for `.err` and `.errgrid`. [Playwright]
10. WHERE kind is `nocamera`, THE Error_Panel SHALL show the tag "No camera", the title "No camera found", the message "Strip could not find a camera to use, or another app is holding it. Close other apps that use the camera, then try again.", the rows "Camera API" ("Present"), "Secure context" ("Yes (HTTPS)" or "No") and "Camera" ("Not found" for NotFoundError, "Not available" for NotReadableError, OverconstrainedError and AbortError), and the actions "Try again" (requests the camera again) and "Open Send" (to `/send`). The App SHALL show this kind, and not the kind `camera`, for NotFoundError, NotReadableError, OverconstrainedError and AbortError. The copy is derived, not from the board. [Playwright]
11. WHERE kind is `format`, `filename`, `draw`, `reader`, `unexpected` or `limit`, THE Error_Panel SHALL show the following verbatim strings (derived copy, in the tone of the board: plain, specific, blaming nothing, one next step), with no rows block: (a) `format`: tag "Newer format", title "This strip needs a newer Strip", message "This strip was made by a newer version of Strip. Open the latest version and scan again.", action "Start over"; (b) `filename`, sender variant: tag "File not accepted", title "File name not accepted", message "The file name is empty, too long or contains a character Strip cannot carry. Rename the file and choose it again.", action "Choose another file" (to `/send`); `filename`, receiver variant: same tag and title, message "The name or type stored in this strip could not be read. Ask the sender to make the strip again.", action "Start over"; (c) `draw`: tag "Could not draw", title "Could not draw the code", message "This browser could not draw the code. Try a current browser.", action "Try again"; (d) `reader`: tag "Reader unavailable", title "The code reader could not start", message "This browser could not start the code reader. Open Strip in a current browser.", actions "Try again" and "Open Send" (to `/send`); (e) `unexpected`: tag "Unexpected error", title "Something went wrong", message "Strip hit an unexpected problem. Nothing was sent or saved. Reload the page and try again.", action "Reload page" (reloads the document); (f) `limit` (a stream above FILE_CAP_BYTES on the receiver, which has no file name): tag "Stream too large", title "This strip is too big for Strip", message "This strip carries more than {cap} KB. Strip carries files up to {cap} KB. Ask the sender to compress the file or split it into smaller files.", actions "Start over" and "About limits" (to `/about#limits`). [unit]
12. THE App SHALL render a kind that has no rows without the rows block and without any other change to the `section.strip.err` structure of ErrorState.dc.html, and SHALL list each added kind as an addition in the task report. [unit]

### Requirement 8: App shell, routing and navigation

**User Story:** As a user, I want every screen at a stable URL with the same navigation, so that I can bookmark, go back and share the page link.

#### Acceptance Criteria

1. THE App SHALL serve the routes of Appendix A from one `index.html` as a single-page app, with client-side navigation that does not reload the page. [Playwright]
2. WHEN a path that is not in Appendix A is requested, THE App SHALL navigate to `/` (Resolved question 21). [Playwright]
3. THE App SHALL render the brand link (`aria-label="Strip home"`, to `/`) and the primary navigation (`aria-label="Primary"`) with the links "Send" (`/send`), "Receive" (`/receive`) and "About" (`/about`) on every screen, as in the boards. [Playwright]
4. WHILE the current route is `/send`, `/send/screen` or `/send/paper`, THE App SHALL set `aria-current="page"` on the "Send" link, WHILE the current route is `/receive`, on "Receive", and WHILE the current route is `/about`, on "About", and no other nav link SHALL carry it. [Playwright]
5. THE App SHALL translate every board link `href="X.dc.html"` to the Route of Appendix A, so that no built page contains the string `.dc.html`. [unit]
6. THE App SHALL keep the Sender_File, the Scan_Session and every control value in memory only, so that a full page reload returns to the initial state of the Route (for `/send/screen` and `/send/paper` without a Sender_File, to `/send`). [Playwright]
7. THE App SHALL set `<html lang="en">`, a `viewport` meta tag with `width=device-width, initial-scale=1`, and a `document.title` per Route taken from the `<title>` of the desktop board (Resolved question 15). [unit]
8. WHEN the user navigates to a hash link such as `/about#limits`, THE App SHALL scroll to the target element. [Playwright]

### Requirement 9: Limits and file intake

**User Story:** As a user, I want clear limits that are enforced before work starts, so that I never wait on a file that cannot be sent or received.

#### Acceptance Criteria

1. THE App SHALL define FILE_CAP_BYTES in one source file and SHALL use that constant in Send_View, About_View, Error_Panel and the receiver decoder limits, so that changing the value changes every use. [unit]
2. THE App SHALL compare the size of a chosen file with FILE_CAP_BYTES before reading its bytes, and SHALL show the Error_Panel kind `size` when the size is greater. [unit]
3. THE App SHALL create the receiver Decoder with `maxPayloadBytes` equal to FILE_CAP_BYTES + 422, where 422 is the longest Metadata_Record (1 + 2 + 255 + 1 + 127 + 4 + 32 bytes), so that a stream above the cap is refused with PAYLOAD_TOO_LARGE. [unit]
4. THE App SHALL create each Encoder with `packetSize: 1732` and the codec default limits, and SHALL map a thrown PAYLOAD_TOO_LARGE or TOO_MANY_BLOCKS to the `size` disposition of Requirement 13. [unit]
5. FOR ALL Sender_Files of 0 to FILE_CAP_BYTES bytes, THE App SHALL produce an Encoder whose `page()` Packets, pushed to a codec Decoder, complete with a payload, name and MIME identical to the input. [property]
6. THE test suite SHALL pin K and T for a deterministic payload with the name "field-notes-2026.pdf" and MIME "application/pdf" at 16, 32, 64, 128, 184 and 256 KB to the values measured with the committed overhead table: K = 10, 20, 39, 78, 111, 155 and T = 24, 41, 67, 112, 149, 200 (a Metadata_Record of 75 bytes, blockSize 1702). [unit]
7. IF the Sender_File name makes the codec reject the Metadata with BAD_METADATA (empty, longer than 255 UTF-8 bytes, containing `/`, `\`, NUL or a control character, or equal to `.` or `..`), THEN THE App SHALL show the disposition of Requirement 13 for BAD_METADATA and SHALL NOT alter the name. [property]
8. WHILE the output `paper` is selected on Send_View, IF the Sender_File size exceeds PAPER_WARN_BYTES, THEN THE Send_View SHALL show the paper warning as a `callout callout--warn` with the title "Many pages" and the text "This file needs {N} printed pages ({T} codes). A smaller file needs fewer pages. You can also show it on screen instead." (derived copy; {N} and {T} computed; at the threshold, T = 67 and N = 8). [unit]
9. THE Image_Intake SHALL take one image at a time, and IF an image file is larger than IMAGE_MAX_FILE_BYTES or IMAGE_MAX_COUNT images were already added in the Scan_Session, THEN THE Image_Intake SHALL refuse the image before decoding it and SHALL show the notice of criterion 13. [unit]
10. THE App SHALL accept exactly one Sender_File per transfer and SHALL state this in the drop hint "one file" and in the About limits row "One. Zip several files first." [unit]
11. WHEN Paper_View is shown for a Sender_File above PAPER_WARN_BYTES, THE Paper_View SHALL show the paper warning of criterion 8 above the preview. [unit]
12. WHEN an accepted image has more than IMAGE_MAX_PIXELS pixels, THE Image_Intake SHALL scale it, keeping the aspect ratio, to a long side of IMAGE_LONG_SIDE pixels before decoding, so that the Decode_Worker receives at most 4096 × 4096 pixels. [unit]
13. THE Image_Intake SHALL show each outcome that adds nothing as a `callout callout--warn` notice (derived copy): title "No code found" with the text "No code was found in {name}. Try a sharper photo with the whole page in frame."; title "Image not added" with the text "{name} was not added. Strip accepts images up to 25 MB, and up to 100 images per session." (file too large or image count reached); title "Image not added" with the text "{name} could not be read as an image." (the browser cannot decode the file). [unit]

### Requirement 10: Paper pipeline

**User Story:** As a sender, I want the printed pages to carry the whole file with repair codes at a size a phone can read, so that the strip survives a smudge or a lost corner.

#### Acceptance Criteria

1. THE App SHALL build the paper set from `encode(payload, { packetSize: 1732 })` and `encoder.page()` with the default repair count R(K) and no override, giving T = K + R(K) Packets in ascending sequence order. [unit]
2. THE App SHALL convert each Packet with `encodeSymbol(packet, { version: 30, ecc: "L" })` (the `QR_DEFAULTS.print` cell) and FOR ALL Packets of an Encoder at packetSize 1732, THE symbol SHALL be version 30 with a 145-module width including the 4-module Quiet_Zone. [property]
3. THE App SHALL use the Quiet_Zone default of 4 modules and SHALL NOT use `allowShortQuietZone` (the board's 3-module tile quiet zone is a mock; Appendix C). [unit]
4. THE App SHALL split the T Packets into N = ceil(T / PER_PAGE) pages, with page p holding the Packets with sequence numbers (p − 1) × PER_PAGE to min(p × PER_PAGE, T) − 1 in order, so that every Packet appears on exactly one page and the last page may be partly filled. [property]
5. THE App SHALL label the tile at position i (1-based) on page p "P{p}·{ii}" with {ii} the 2-digit number, and the caption "{g}/{T}" with g = (p − 1) × PER_PAGE + i. [property]
6. THE App SHALL print on each Print_Sheet a human-readable header with the file name, the text "PAGE {p} / {N}" and the Session_Short, where the Session_Short is the first 4 uppercase hexadecimal digits of the Session_Id (the board header has no session id; approved addition, Resolved question 15). [Playwright]
7. THE Stylesheet print rules SHALL apply: `.no-print` hidden, `@page { margin: 0 }`, each `.paper` 210 mm by 297 mm with `break-after: page`, and ink `#000` on paper `#FFF` with `print-color-adjust: exact`. [Playwright]
8. WHEN the user prints, THE App SHALL put all N Print_Sheets in the document, so that the generated PDF (Playwright `page.pdf()` with print media) has exactly N pages and the header of page p contains "PAGE {p} / {N}". [Playwright]
9. WHEN printed on A4 at 100% scale with the board grid, THE width of one code SHALL be at least 145 × 0.339 mm = 49.2 mm (4 printer dots per module at 300 dpi; PROPOSED bound), measured on the layout in print emulation, and THE test SHALL report the printed module size in mm (the board grid gives about 58.8 mm per code, 0.405 mm per module). [Playwright]
10. WHERE the paper `letter` is selected, THE App SHALL print on Letter paper with no tile clipped or overflowing the sheet, using the CSSOM mechanism of Resolved question 14: WHEN `letter` is selected, THE App SHALL insert, through `CSSStyleSheet.insertRule` on a constructed or App stylesheet and not through any `style` attribute or inline `<style>`, an `@page { size: Letter; margin: 0 }` rule and a print rule that sets `.paper` to 215.9 mm by 279.4 mm, and WHEN `a4` is selected, THE App SHALL remove them, with zero `securitypolicyviolation` events. [Playwright]
11. THE App SHALL print through `window.print()` only, opening no popup window (`window.open` is never called) and no frame, and SHALL produce no `securitypolicyviolation` event. [Playwright]
12. FOR ALL paper sets, pushing the T Packets of the tiles in any order into a codec Decoder SHALL complete with bytes identical to the Sender_File. [property]
13. THE ruler `.ruler__bar` SHALL measure 100 mm ± 1 mm on an A4 Print_Sheet (47.6% of the sheet width), matching the text "10 cm". [Playwright]

### Requirement 11: Screen pipeline

**User Story:** As a sender, I want a smooth, controllable code stream that respects reduced-motion settings, so that a phone can read it and nobody is harmed by it.

#### Acceptance Criteria

1. WHEN Stream_View mounts, THE Stream_Player SHALL create a new Encoder with `packetSize: 1732`, SHALL call `next()` once per tick, and SHALL show the Packets with sequence numbers 0, 1, 2, … in order. [unit]
2. THE Stream_Player SHALL convert each Packet with `encodeSymbol(packet, { version: 30, ecc: "L" })`. [unit]
3. THE Stream_Player SHALL schedule ticks every 1000 / fps milliseconds through the `apps/strip/src/clock` module, so that no other App module reads time, and a fake clock SHALL drive the unit tests. [unit]
4. WHEN the Speed value changes, THE Stream_Player SHALL apply the new interval from the next tick without restarting the sequence. [unit]
5. FOR ALL sequences of play, pause, step and speed-change actions, THE sequence numbers shown SHALL be consecutive from 0, with no Packet skipped and none repeated. [property]
6. FOR ALL speeds from FPS_MIN to FPS_MAX and a fake-clock run of 10 s, THE number of Packets shown SHALL be 10 × fps ± 1. [property]
7. WHILE the Stream_Player is paused, THE Stream_Player SHALL NOT call `next()` and SHALL keep the current code on the stage. [unit]
8. WHERE `prefers-reduced-motion: reduce` matches when Stream_View mounts, THE Stream_View SHALL start in Step_Mode on Packet 1 and SHALL NOT auto-play, THE Step control (not in the design; approved addition, Resolved question 15) SHALL show exactly the next Packet per activation, and the user MAY choose Play to start the timer (Resolved question 27). [Playwright]
9. THE reduced-motion behaviour SHALL be in the App logic, because the Stylesheet comment states that code playback "keeps its frame rate" under `prefers-reduced-motion`, while the chrome animations are turned off by the Stylesheet. [Playwright]
10. WHERE the Fullscreen API is available, THE Stream_View SHALL offer a full-screen control that requests full screen on the stage element, and WHERE it is unavailable THE Stream_View SHALL omit the control (the control is not in the design; Resolved question 15). [Playwright]
11. WHILE the stage is full screen, THE stage SHALL keep a #FFF background and nothing SHALL overlap the code. [Playwright]
12. WHEN the document becomes hidden, THE Stream_Player SHALL pause. [Playwright]
13. WHEN the user leaves Stream_View, THE Stream_Player SHALL stop its timer and release the Encoder. [unit]
14. WHEN the code size is changed, THE Stream_View SHALL change only the stage class and SHALL NOT re-encode. [unit]
15. WHEN the stage is rasterized by Playwright at device pixel ratio 2 for Medium and Large and at 1 for Large, THE decoder `decodeFrame` SHALL return the exact Packet, and THE test SHALL report the result for Small at both ratios and Medium at ratio 1 without a pass bar (3.86 CSS pixels per module for Medium, 2.62 for Small; Resolved question 13). [measured]
16. THE median work of one tick (`next()`, `encodeSymbol`, SVG string and render) at version 30 SHALL be at most 33 ms (half of 1000 / FPS_MAX; PROPOSED), measured by the Perf_Method of the symbols spec and reported. [perf]
17. THE Stream_Player lap SHALL be T Packets at FPS_DEFAULT (the "loop" of the Send_View choice line), THE stream SHALL continue after T with further Packets from `next()`, and THE counter SHALL continue past K ("Packet 130 of 111 + repair") while the progress bar stays at K (Resolved question 27). [unit]

### Requirement 12: Receiver pipeline

**User Story:** As a receiver, I want live camera scanning and photo input to feed one decoder, so that I can rebuild the file from a screen, a printed strip or photos of its pages.

#### Acceptance Criteria

1. WHEN camera access is granted, THE Frame_Loop SHALL request video with `facingMode: "environment"`, ideal width 1920, ideal height 1080 and no audio. [unit]
2. THE Frame_Loop SHALL draw each video frame to a canvas scaled down (never up) to fit 1920 × 1080 and SHALL send the pixels to the Decode_Worker, created with `maxWidth` 1920, `maxHeight` 1080 and mode `video`, so that no frame exceeds the Frame_Decoder maximum. [unit]
3. THE Frame_Loop SHALL submit a frame only while the Decode_Worker is idle, SHALL drop every other frame without a copy, and SHALL hold no pending frame. [unit]
4. WHILE the Frame_Loop runs in Chromium, THE App SHALL produce no main-thread task longer than 50 ms attributable to decoding. [Playwright]
5. WHEN the decode outcome is `found`, THE App SHALL push the Packet bytes to the Scan_Session Decoder and SHALL wait for the returned status before pushing the next Packet. [unit]
6. WHEN the outcome is `not_found`, `not_strip_packet` or `dropped`, THE App SHALL take no user-visible action. [unit]
7. THE App SHALL show "Packets seen" as `progress().distinctPackets`, "Blocks solved" as `solvedBlocks` followed by " / {totalBlocks}", and the ring percent as `floor(100 × solvedBlocks / totalBlocks)` (0 while totalBlocks is 0) and 100 only when `complete` is true. [property]
8. FOR ALL sequences of Packets, THE displayed packets seen, blocks solved and percent SHALL never decrease within one Scan_Session. [property]
9. WHEN the Receive_Phase is `done` and the user activates "Save file", THE App SHALL create a Blob of the Decoder payload with the MIME type of the Metadata, start a download with an anchor `download` attribute equal to the Metadata name, revoke the object URL afterwards, and the downloaded bytes SHALL equal the sent bytes, with zero `securitypolicyviolation` events. [Playwright]
10. THE App SHALL accept image files through Image_Intake (`input type="file"`, `accept="image/*"`, `multiple`, labelled and keyboard operable), SHALL decode one image at a time through `createImageBitmap` and the Decode_Worker `bitmap` message in `photo` mode with a maximum frame size of 4096 × 4096 (the Image_Intake limit of Requirement 9, criterion 12), and SHALL push every Packet found into the same Scan_Session, so that images added later add to the progress of earlier ones. [Playwright]
11. WHEN an image is a photo or a scan of a printed page with several symbols, THE Image_Intake SHALL obtain every symbol in the image through `@strip/symbols` (Multi_Symbol_Read, dependency D2) and SHALL push every Packet found into the Scan_Session, so that one image of a page with all {PER_PAGE} symbols adds all {PER_PAGE} Packets. [Playwright]
12. WHILE the Receive_Phase is `scan` or `dup` and at least one Packet has been accepted, IF `solvedBlocks` does not increase for STALL_TIMEOUT_MS, THEN THE App SHALL show the Error_Panel kind `stall`, with the elapsed time read from the `clock` module. [unit]
13. WHEN the user activates the torch button, THE App SHALL apply the `torch` constraint to the video track and SHALL show the button only when `getCapabilities().torch` is true. [Playwright]
14. WHEN the Receive_Phase becomes `verify`, `done` or `failed`, or the user leaves the route, or activates "Stop scanning", THE App SHALL stop every camera track. [Playwright]
15. WHEN the document becomes hidden, THE Frame_Loop SHALL stop submitting frames and SHALL resume when the document becomes visible. [Playwright]
16. THE App SHALL NOT record, store or send video or frames, and the source SHALL contain no `MediaRecorder`, `ImageCapture` or frame-persisting call. [unit]
17. THE App SHALL create the Decode_Worker with `new Worker(new URL(…), { type: "module" })` from a same-origin file and SHALL pass the wasm URL from `@strip/symbols/wasm-url`, with the wasm requested from the same origin and not before the first receive action. [Playwright]
18. WHERE the URL contains the fragment `#diag`, THE Receive_View of the production bundle SHALL show per-frame outcome (`found`, `not_found`, `dropped`), decode time, frames offered, decoded and dropped, and sustained decodes per second, as `docs/device-test.md` requires of the receiver page (the readout is not in the design; Resolved question 29). [Playwright]
19. WHEN a Packet is pushed and the status is `ignored` with reason SESSION_MISMATCH, THE App SHALL increment the skipped counter and SHALL read the foreign session id with `decodePacket(bytes).sessionId` for the HUD. [unit]
20. WHEN a Packet is pushed and the status is `ignored` with reason DUPLICATE_PACKET, ALREADY_COMPLETE or DENSE_STORE_FULL, THE App SHALL leave every displayed number and the Receive_Phase unchanged. [unit]
21. WHILE the Frame_Loop sees a printed page with several symbols, THE Frame_Loop SHALL obtain every symbol in each submitted frame through `@strip/symbols` (Multi_Symbol_Read, dependency D2) and SHALL push every Packet found into the Scan_Session. [Playwright]

### Requirement 13: Error mapping

**User Story:** As a user, I want every failure explained in plain words with a next step, so that I am never shown an internal code.

#### Acceptance Criteria

1. THE App SHALL map every member of the codec ErrorCode union (10), the codec Ignore_Reason union (4), the SymbolErrorCode union (4), the DecodeOutcome kinds (4) and the camera and environment failures to exactly one disposition in Appendix E, as a total function checked against the exported `ERROR_CODES` and `SYMBOL_ERROR_CODES`. [property]
2. FOR ALL error inputs, THE rendered DOM text SHALL NOT contain any code string (for example `HASH_MISMATCH` or `PAYLOAD_TOO_LARGE`). [property]
3. WHERE Appendix E names a board state, THE App SHALL show that board state with verbatim copy. [Playwright]
4. WHERE Appendix E names an added Error_Panel kind, THE App SHALL show the Error_Panel kind named in Appendix E, with the verbatim strings of Requirement 7, criteria 10 and 11. [unit]
5. WHEN the camera permission is refused (`NotAllowedError`, `SecurityError`), THE App SHALL enter the Receive_Phase `denied`, and WHEN `navigator.mediaDevices` or `getUserMedia` is absent, THE App SHALL show the Error_Panel kind `camera`, and WHEN `getUserMedia` fails with NotFoundError, NotReadableError, OverconstrainedError or AbortError, THE App SHALL show the Error_Panel kind `nocamera`. [Playwright]
6. IF the Decode_Worker cannot start or the wasm cannot load (UNSUPPORTED_ENVIRONMENT), THEN THE App SHALL show the Error_Panel kind `reader` and SHALL keep the sender screens usable. [Playwright]
7. THE App SHALL NOT call `result()` before `progress().complete` is true, so that INCOMPLETE_DECODE is never raised. [unit]
8. IF an exception that is neither a CodecError nor a SymbolError reaches the top of a view, THEN THE App SHALL show the Error_Panel kind `unexpected` and SHALL NOT show a stack trace. [unit]
9. THE App SHALL send no error report anywhere. [Playwright]

### Requirement 14: PWA (manifest, service worker, offline, install)

**User Story:** As a user on a plane or a train, I want to install Strip and use it with no connection, so that I can send or receive a file anywhere.

#### Acceptance Criteria

1. THE App SHALL serve a web app manifest with `name` "Strip", `short_name` "Strip", `start_url` "/", `scope` "/", `display` "standalone", `background_color` and `theme_color` each equal to `#F7F5EF` (the Stylesheet `--paper-50`), and `icons` containing a 192 px PNG, a 512 px PNG and a 512 px maskable PNG, all same-origin. [unit]
2. THE index.html SHALL link the manifest and set a `theme-color` meta tag equal to the manifest `theme_color`. [unit]
3. THE App SHALL register a service worker from `/sw.js` with scope `/` after the page has loaded, and the service worker SHALL be served as a same-origin file under the App_CSP. [Playwright]
4. THE service worker SHALL precache the app shell, every hashed script and stylesheet, the fonts, the reader `.wasm`, the manifest, the icons and THIRD_PARTY_NOTICES, with a precache list generated at build time and every entry same-origin. [unit]
5. WHEN the network is offline after the first load and service worker activation, THE App SHALL load each Route of Appendix A, run a send, and decode an image, with zero failed requests. [Playwright]
6. WHEN a navigation request for a Route of Appendix A is not in the cache or network, THE service worker SHALL answer with the cached `index.html`. [unit]
7. THE service worker SHALL make no request to another origin and SHALL cache only same-origin app assets. [Playwright]
8. THE App SHALL meet the installability criteria of Chromium (manifest fields above, 192 and 512 icons, registered service worker, HTTPS) and the install SHALL be checked on one Android phone and one iPhone. [manual]
9. WHEN a new service worker version is installed, THE service worker SHALL stay in the `waiting` state and take over only when no window of the App remains open, SHALL NOT call `skipWaiting`, and the running page SHALL keep its assets for the whole session (Resolved question 25). [Playwright]

### Requirement 15: CSP and delivery headers

**User Story:** As the app owner, I want one strict policy delivered as HTTP headers on every response, so that the app cannot load or run anything it does not ship.

#### Acceptance Criteria

1. THE App SHALL deliver the App_CSP as the HTTP response header `Content-Security-Policy` with exactly this value: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` (the Strip_CSP with `worker-src 'self'` added after `script-src`; Resolved question 20). [unit]
2. THE App_CSP SHALL contain neither 'unsafe-eval' nor 'unsafe-inline' and SHALL leave `style-src`, `img-src`, `font-src`, `manifest-src` and `media-src` unset so that each falls back to 'self'. [unit]
3. THE `apps/strip/src/csp.ts` source SHALL keep exporting `STRIP_CSP` unchanged and SHALL export the App_CSP, derived from it, and a unit test SHALL assert that the App_CSP equals the literal of criterion 1 and equals `STRIP_CSP` with `worker-src 'self'` inserted. [unit]
4. THE App SHALL deliver the response header `Permissions-Policy: camera=(self)`. [unit]
5. THE repository SHALL contain `vercel.json` (not present when this spec was written) whose `headers` entry for the source `/(.*)` sets `Content-Security-Policy` to the App_CSP and `Permissions-Policy` to `camera=(self)` on every route and asset, plus `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff` (Resolved question 20), and a unit test SHALL assert that each value equals the export of `csp.ts` character for character. [unit]
6. THE `vercel.json` SHALL serve `.wasm` files with `Content-Type: application/wasm` and SHALL rewrite the Routes of Appendix A to `/index.html`. [unit]
7. THE Vite dev server, the Vite preview server and the e2e harness server SHALL send the same two headers from `csp.ts`, and a Playwright test SHALL assert that the page, the worker script, `sw.js`, the manifest and the `.wasm` responses each carry them. [Playwright]
8. WHEN every flow of Requirement 21 runs under the App_CSP, THE test SHALL observe zero `securitypolicyviolation` events and zero console errors, covering the worker, the service worker, print, the blob download, the clipboard copy, full screen and the camera. [Playwright]
9. THE built `index.html` SHALL contain no inline script, no inline `<style>`, no `style=""` attribute and no event-handler attribute, and styling by the React `style` prop SHALL be limited to CSSOM-set custom properties, each reported in the task report. [unit]
10. THE App documentation SHALL state that the policy is header-only (frame-ancestors is ignored in a meta element). [manual]

### Requirement 16: Privacy

**User Story:** As a user with a private file, I want proof that nothing leaves my device and nothing is kept, so that I can trust Strip with it.

#### Acceptance Criteria

1. WHEN the Request_Log test runs every flow of Requirement 21 (all Routes, paper, screen, image intake, camera, download, print, offline reload), THE Request_Log SHALL contain only same-origin requests whose paths are in the built asset list, and none to any other origin. [Playwright]
2. THE Request_Log SHALL contain no request with a body and no method other than GET (and the service worker's own GETs). [Playwright]
3. THE App SHALL contain no analytics, no beacon and no third-party script, and the source and bundle SHALL contain no `sendBeacon`, `XMLHttpRequest`, `WebSocket` or `EventSource`. [unit]
4. WHEN the flows of Requirement 21 finish, THE `localStorage`, `sessionStorage` and `document.cookie` SHALL be empty, `indexedDB.databases()` SHALL list none, and every Cache API entry SHALL be a URL of the precache list, so that no file byte or file name is stored. [Playwright]
5. THE App SHALL hold file bytes in memory only, drop them on "Remove file", and revoke the download object URL after use. [unit]
6. THE built assets SHALL contain no `https://` or `http://` URL other than the repository URL (Resolved question 23) and the SVG namespace `http://www.w3.org/2000/svg`. [unit]
7. THE App SHALL NOT persist the Speed, code size or paper choice. [Playwright]
8. THE App SHALL NOT request `fonts.googleapis.com` or `fonts.gstatic.com`, proved by the Request_Log. [Playwright]

### Requirement 17: Accessibility

**User Story:** As a user who cannot use a mouse or who prefers less motion, I want to operate every screen with the keyboard and a screen reader, so that Strip is usable by everyone.

#### Acceptance Criteria

1. THE App SHALL let a keyboard-only user complete a paper send (choose a file, choose the output, continue, print), a screen send (continue, pause, play, change speed and size) and every Receive button, in a Playwright run that uses no pointer events. [Playwright]
2. THE App SHALL keep the `:focus-visible` outline of the Stylesheet and SHALL add no `outline: none`. [unit]
3. FOR EACH screen, THE Playwright ARIA snapshot SHALL equal the roles and names of the board (including `aria-label`, `aria-current`, `aria-live`, `role="status"` and `role="alert"`). [Playwright]
4. WHEN the route changes by client navigation, THE App SHALL move focus to the main heading of the new view. [Playwright]
5. THE App SHALL keep every control at least `--tap` (48 px) tall as the Stylesheet defines, and SHALL NOT shrink them. [Playwright]
6. WHEN the user presses Space on Stream_View with focus on the page body, THE Stream_View SHALL toggle play and pause, and WHEN focus is on a button or input, Space SHALL keep its native action. [Playwright]
7. WHERE `prefers-reduced-motion: reduce` matches, THE App SHALL turn chrome animation off through the Stylesheet and SHALL apply Requirement 11, criterion 8 to the stream. [Playwright]
8. THE Image_Intake control, the Step control and the full-screen control SHALL have accessible names. [Playwright]

### Requirement 18: Performance and bundle gates

**User Story:** As a maintainer, I want the size and speed of the app reported and bounded, so that a regression is caught before release.

#### Acceptance Criteria

1. THE build SHALL print the Bundle_Report (every emitted asset with raw, gzip and brotli bytes, and totals) and SHALL write it as a JSON file outside `dist`. [unit]
2. THE total gzip bytes of the assets the first visit to `/` loads, excluding the 946,598-byte reader `.wasm` and the decode worker, SHALL be at most 400 KB (the First_Load_Budget; Resolved question 26; revisited after the first Bundle_Report). [unit]
3. THE reader `.wasm` SHALL stay at most 1,000,000 bytes (symbols Requirement 7, criterion 8). [unit]
4. WHEN the route `/` loads, THE Request_Log SHALL contain no `.wasm` request, and THE `.wasm` SHALL be requested only after the first receive action. [Playwright]
5. THE perf script SHALL report the time to encode and render T symbols at the FILE_CAP_BYTES size (T = 200 for 256 KB), with no budget. [perf]
6. THE `pnpm typecheck`, lint and test commands SHALL pass for the App, and the TypeScript compiler SHALL report zero errors under `strict`. [unit]

### Requirement 19: Design hand-off conversion

**User Story:** As the designer, I want the boards converted without restyling, so that the app looks exactly as I drew it.

#### Acceptance Criteria

1. THE App SHALL convert each routed Board to React components keeping class names, text content, element structure and ARIA attributes, and the task report SHALL list every deviation with its reason. [manual]
2. THE App SHALL ship the Stylesheet as a copy, and a unit test SHALL assert that the SHA-256 of the shipped `strip.css` equals the SHA-256 of `design/project/strip.css`, with every addition in the Additions_Stylesheet and every `@font-face` rule in the Fonts_Stylesheet (Resolved question 17). [unit]
3. THE App SHALL self-host IBM Plex Sans and IBM Plex Mono at weights 400, 500 and 600 (the weights of the boards' font link) as OFL woff2 files under `apps/strip/public/fonts`, with the licence file included and the `@font-face` rules in the Fonts_Stylesheet. [unit]
4. THE built HTML, CSS and JavaScript SHALL contain no `fonts.googleapis.com` string. [unit]
5. THE App SHALL NOT ship `codegen.js`, `support.js`, `canvas.json`, Main.dc.html or any `*.dc.html`, and SHALL NOT import them (the test-only Baseline asset `design/project/support.js` is excluded from lint and from the build). [unit]
6. THE App SHALL translate each Template_Construct to a React equivalent and the task report SHALL list each construct used: `{{ }}` as JSX expressions, `sc-for` as `Array.map` with a key, `sc-if` as conditional rendering, `dc-import` as a component import, `x-dc` removed, `helmet` removed, `data-dc-script` component classes as function components with props, and `hint-*` attributes dropped. [manual]
7. THE `apps/strip/src` and the built output SHALL contain none of the strings `{{`, `sc-for`, `sc-if`, `dc-import`, `x-dc`, `<helmet`, `data-dc-script`, `hint-placeholder` and `hint-size`. [unit]
8. THE App SHALL replace each of the 17 inline `<style>body{margin:0}</style>` blocks by one rule in the Additions_Stylesheet, and SHALL report each use of the React `style` prop. [unit]
9. THE App SHALL render every code from `@strip/symbols` and SHALL NOT call `StripCode.make`. [unit]
10. THE App SHALL compute each board `aria-label` that carries an interpolation (ring "Progress {pct} percent", stage and code labels, tile labels, "{pct} percent solved") at render time. [unit]
11. THE `page--m` root class SHALL appear only in the Harness_Build. [unit]

### Requirement 20: Fidelity gate

**User Story:** As the designer, I want a failing test when the app drifts from the boards, so that fidelity is enforced and not hoped for.

#### Acceptance Criteria

1. THE Fidelity_Gate SHALL contain one Playwright screenshot-diff test for each of these 23 targets: the desktop boards Home, Send, SendScreen, SendPaper, Receive (scanning), About and Errors (7); the mobile boards HomeMobile, SendMobile, SendScreenMobile, SendPaperMobile, AboutMobile and ErrorsMobile (6); the 7 Receive_Phases at 390 px (ReceiveStates cells); and the 3 Error_Panel kinds (ErrorState component). [Playwright]
2. THE Baseline SHALL be rendered from the original design HTML in Chromium, by the design runtime `support.js` supplied by the user (precondition P1, status: awaiting support.js from the user), placed in `design/project/` as a test-only Baseline asset, never shipped and excluded from lint, and the test code SHALL NOT contain a custom renderer for the Template_Constructs. [Playwright]
3. THE Baseline and the App screenshot SHALL use the same viewport (the board sizes of `canvas.json`: 1280 px wide for desktop, 390 px for mobile, 390 × 860 for a Receive_Phase, 420 px wide for an Error_Panel), a device pixel ratio of 1, animations disabled and the same self-hosted fonts, with the Google Fonts URL answered from the self-hosted files by request routing. [Playwright]
4. THE diff threshold SHALL be 1% of pixels, with the QR_Mask over every code region. [Playwright]
5. WHERE the App computes a number that the Board shows as a mock (Appendix C), THE Baseline SHALL use the same computed value through a documented substitution table, or THE region SHALL be masked, each substitution and each mask being listed in the task report; the fixture is "field-notes-2026.pdf" of 188,416 bytes so that the size text equals the board (Resolved question 22). [Playwright]
6. IF a Fidelity_Gate test fails, THEN THE task SHALL fail. [manual]
7. THE Fidelity_Gate SHALL run in the Harness_Build, which includes the gallery routes of Resolved question 21 and the `page--m` class. [Playwright]
8. THE App SHALL mark each element that exists only as an approved addition (Resolved question 15, including the Photosensitivity_Notice, the paper warning, the Step, Play and full-screen controls, the image control, the session id in the printed header and the notices link) with the attribute `data-addition`, and THE Fidelity_Gate SHALL hide those elements with a Playwright-injected stylesheet in both the Baseline and the App screenshot, each addition being covered by its own functional test. [Playwright]
9. THE Fidelity_Gate task SHALL NOT start until precondition P1 is met (`design/project/support.js` present), and the status of P1 SHALL be recorded in the task report. [manual]

### Requirement 21: End-to-end round trips

**User Story:** As a maintainer, I want automated proof that a file goes in one side and comes out byte for byte on the other, so that a release is never a guess.

#### Acceptance Criteria

1. WHEN the Playwright paper test chooses a deterministic fixture file on `/send`, continues to `/send/paper`, renders every Print_Sheet in print emulation at a device pixel ratio that gives at least 4 pixels per module, and adds the page images (each carrying all {PER_PAGE} = 9 symbols of its page, fewer on the last page) to Image_Intake on `/receive` one at a time, THE receiver SHALL obtain every symbol of each page image through Multi_Symbol_Read (dependency D2), and THE downloaded file SHALL be byte-identical to the fixture with the same name and MIME type, and the progress SHALL increase as pages are added. [Playwright]
2. WHEN the last page (repair Packets only) is withheld, THE Receive_View SHALL still reach `done` with the identical file. [Playwright]
3. WHEN the Playwright screen test steps the stream in manual step mode, captures the stage at each step at 4 or more pixels per module, and feeds the captures to the production Frame_Loop through an injected camera stream, THE downloaded file SHALL be byte-identical to the fixture. [Playwright]
4. WHEN Packets of a second file are interleaved, THE Receive_View SHALL enter `dup`, count the skipped Packets, and after "Keep current file" complete the first file. [Playwright]
5. WHEN the test builds Packets whose payload is altered but whose CRCs are valid, so that the hash differs, THE Receive_View SHALL enter `failed` and offer no download. [Playwright]
6. WHEN the camera permission is denied, THE Receive_View SHALL enter `denied`, and WHEN `navigator.mediaDevices` is removed, THE App SHALL show the Error_Panel kind `camera`. [Playwright]
7. WHEN a file of FILE_CAP_BYTES + 1 bytes is chosen, THE Send_View SHALL show the Error_Panel kind `size` and SHALL NOT navigate. [Playwright]
8. WHEN no Packet adds a solved block for STALL_TIMEOUT_MS (fake clock), THE Receive_View SHALL show the Error_Panel kind `stall`. [Playwright]
9. WHEN the Receive_View is cancelled and restarted, THE counters SHALL return to 0. [Playwright]
10. THE real-device check of `docs/device-test.md` SHALL be run on at least three phones, with the paper and screen sets printed and shown from the App, and the result recorded. [manual]

### Requirement 22: Dependencies, boundaries and purity

**User Story:** As the project owner, I want every dependency approved and every boundary enforced, so that supply-chain risk and architecture stay under control.

#### Acceptance Criteria

1. THE App SHALL import only the public barrels of `@strip/codec` and `@strip/symbols` and the subpath `@strip/symbols/wasm-url`, enforced by ESLint. [unit]
2. THE `apps/strip/src` SHALL contain no `Math.random`, `Date.now` or `performance.now` outside `apps/strip/src/clock`, enforced by ESLint. [unit]
3. WHEN a task adds a package entry to a package.json, THE same task SHALL add its row (name, exact version, license, reason) to `docs/dependencies.md` and SHALL have the user's approval first; the packages approved by the user are `react`, `react-dom`, `@types/react` and `@types/react-dom`, each pinned exactly and added with its row in the task that adds it (Resolved question 24), and any other package, including `@vitejs/plugin-react` and any router or service-worker library, needs a new approval. [unit]
4. THE `apps/strip/package.json` SHALL use exact versions only and SHALL contain no dependency on `qr` or `zxing-wasm`. [unit]
5. THE THIRD_PARTY_NOTICES file SHALL name each third-party component this spec adds to the shipped bundle or assets (React and react-dom under MIT, IBM Plex under OFL-1.1) with its exact version, licence and licence text, and a unit test SHALL assert each. [unit]
6. THE `apps/strip/src` SHALL NOT import `zod`, so that the zod eval probe raises no `securitypolicyviolation` event, and the few App inputs SHALL be validated by hand (Resolved question 30). [unit]
7. THE App tests SHALL NOT depend on a DOM emulation library (Resolved question 24). [unit]

## Correctness properties to be numbered in design

- File intake: for any file of 0 to FILE_CAP_BYTES bytes, App encode then codec decode returns the same bytes, name and MIME.
- MIME fallback: for any `File.type` string, the Metadata MIME is a valid codec MIME type, and `application/octet-stream` when the input is empty or invalid.
- Metadata rejection: for any name that breaks the codec rules, the App shows a disposition and never alters the name.
- Size formatting: for any byte count, the "{n} KB" and "{bytes} bytes" text round-trips to the byte count within the rounding rule, and `{cap}` is the cap divided by 1024.
- Hash chip: for any bytes, the chip is the first 12 hex digits of SHA-256 in 3 groups of 4, and equals the Metadata_Record hash.
- Pagination: for any T of 1 or more, N = ceil(T / PER_PAGE), every Packet appears on exactly one page in sequence order, labels and captions are unique and consistent.
- Paper completeness: for any file and any permutation of the tile Packets, a codec Decoder completes with identical bytes.
- Symbol cell: for any Packet of 1732 bytes, the symbol is version 30 ECC L, 145 modules wide with the quiet zone.
- Stream order: for any sequence of play, pause, step and speed actions, shown sequence numbers are consecutive from 0.
- Stream rate: for any fps from 2 to 15 and a fake-clock run, the number of Packets shown is fps times the duration within 1.
- Progress monotonicity: for any Packet sequence, packets seen, blocks solved and percent never decrease, percent is 100 only when complete.
- Receive state machine: for any event sequence (Packets of sessions A and B, duplicates, corrupt Packets, user actions), the phase is one of the seven values, `done` holds only when the codec is complete, no download is offered unless complete, and the skipped counter equals the number of SESSION_MISMATCH statuses.
- Error mapping is total: every code of every union has exactly one disposition and no raw code reaches the DOM.
- Ring arc: for any percent from 0 to 100, the arc path is well formed, empty at 0 and the full circle at 100.
- Session_Short: for any 32-bit session id, the display form follows the rule of Resolved question 19 and is unique per distinct pair when the collision rule applies.
- Header equality: the App_CSP, the `vercel.json` values and the served headers are the same string.

## Out of scope

- Accounts, sign-in and profiles.
- Encryption of the file or of the packets (the About copy states that Strip does not encrypt).
- Compression of the file before encoding. Future work: compress the payload (for example deflate) before encoding to cut K and T; it needs a codec Metadata field and a design for the About limits text.
- Cloud services, a backend, sync, share links and upload of any kind.
- Native apps.
- A WebRTC or other network fallback.
- Multi-file bundles (the user zips several files first).
- Print drivers, printer calibration and colour management beyond black on white at 100%.
- Analytics and crash reporting.
- Changes to `@strip/codec` and `@strip/symbols` (the amendments that this spec needs are listed under Dependencies on other work and are made in their own specs, not here).
- Lighthouse score budgets.
- Persisting any user preference or file.
- Light or dark theming (the Stylesheet states that code and print colours are fixed and never themed).

## Dependencies on other work

The App depends on the following changes outside `apps/strip`. None is made by the App tasks; each is done in its own spec first, and the App tasks that need it wait for it.

- **D1: Codec digest amendment.** A HASH_MISMATCH rejection carries the first 12 hexadecimal digits of the expected and of the actual SHA-256, exposed on the Decoder. It is made in the codec spec before the App task that implements Requirement 5, criterion 9 (Resolved question 18).
- **D2: Symbols multi-symbol capability.** The spike `docs/spikes/symbols-multi.md` decides the approach: first choice a multi-symbol option in the `@strip/symbols` `decodeFrame` (zxing `maxNumberOfSymbols`), fallback app-side tiling of overlapping windows. The symbols spec, design and tasks are amended after the spike. The result shape and the option name are defined by that amendment, and this spec cites it by its id once it exists (id: to be assigned). The App tasks for Requirement 12, criteria 11 and 21, and Requirement 21, criteria 1 and 2 wait for the spike (Resolved question 11).
- **D3: Symbols CSP amendment.** Symbols Requirement 9, criteria 3 and 5 and `csp.ts` add `worker-src 'self'`; performed separately (Resolved question 20).
- **P1: Fidelity precondition.** `design/project/support.js` is supplied by the user from the original export. Status: awaiting support.js from the user. The Fidelity_Gate task (Requirement 20) does not start before it is present (Resolved question 22).

## Appendix A: Screen inventory

| # | Screen | Source file(s) | Route | States | Mobile variant |
|---|---|---|---|---|---|
| 1 | Home | Home.dc.html | `/` | one | HomeMobile.dc.html (Home with `mobile`) |
| 2 | Send, step 1 (file and output) | Send.dc.html | `/send` | with file (board); empty and drag-over (not designed); size error (Error_Panel `size`) | SendMobile.dc.html |
| 3 | Send, Screen | SendScreen.dc.html | `/send/screen` | playing (board); paused and step mode (not designed) | SendScreenMobile.dc.html |
| 4 | Send, Paper | SendPaper.dc.html | `/send/paper` | page 1 of N to N of N; A4 and Letter | SendPaperMobile.dc.html |
| 5 | Receive | Receive.dc.html, ReceiveState.dc.html | `/receive` | `ask`, `denied`, `scan`, `dup`, `verify`, `done`, `failed`; stall and camera Error_Panel | ReceiveStates.dc.html (gallery of the 7 phases at 390 px; no separate mobile file) |
| 6 | About and privacy | About.dc.html | `/about` (anchors `#privacy`, `#account`, `#caveat`, `#limits`, `#credits`) | one | AboutMobile.dc.html |
| 7 | Error states | Errors.dc.html, ErrorState.dc.html | inline component; gallery route in the Harness_Build only | `size` (used on `/send`), `camera` (used on `/receive`), `stall` (used on `/receive`) | ErrorsMobile.dc.html |
| – | Design system | Main.dc.html | not routed, not shipped | – | – |

Other files in `design/project`: `strip.css` (the Stylesheet, shipped as a copy), `codegen.js` (never shipped), `canvas.json` (never shipped), `support.js` (referenced by all 17 boards and absent from the repository; status: awaiting support.js from the user, who will place it in `design/project/` as a test-only Baseline asset, never shipped; precondition P1). Board `<title>` values: Home "Strip home"; Send "Send step 1"; SendScreen "Send on screen"; SendPaper "Send on paper"; Receive "Receive desktop"; About "About and privacy"; Errors "Error states".

## Appendix B: Design-folder inventory

Counts were taken by searching the 17 `*.dc.html` files in `design/project`. Counts of opening tags and of opening plus closing tags are both given where they differ.

| Item | Count | Where and handling |
|---|---|---|
| Board files | 17 | 16 screens or components plus Main (design system) |
| `style=""` attributes in markup | 0 | The only match is a text mention in Main.dc.html (line 177) |
| Inline `<style>body{margin:0}</style>` inside `<helmet>` | 17 | One per board, one identical rule; `strip.css` has no body margin reset, so the rule moves into the stylesheet addition (required addition, reported) |
| Google Fonts `<link>` (fonts.googleapis.com) | 17 | In every board; never shipped; fonts are self-hosted |
| `https://github.com/` | 3 | Home footer (1), About footer link and credits button (2); replaced by REPO_URL (Resolved question 23); navigations, not fetches |
| `{{ }}` interpolations | 120 | In text and in attributes: `class` 15, `d` 9, `aria-label` 4, `href` 2, `disabled` 1, `list` 13, `value` 17, `phase` 1, `hint-placeholder-val` 17 |
| `sc-for` | 13 opening, 26 with closing tags | Lists: tiles, rows, tips, howto, cells, and Main design-system lists |
| `sc-if` | 17 opening, 34 with closing tags | Receive and Error component state switches |
| `dc-import` | 11 opening, 22 with closing tags | Mobile variants, Receive, Errors, ReceiveStates |
| `x-dc` wrappers | 17 | One per board |
| `helmet` | 17 | One per board |
| `data-dc-script` component classes (DCLogic) | 17 | Props `mobile`, `phase`, `kind` |
| `hint-*` attributes | 41 | `hint-placeholder-val` 17, `hint-placeholder-count` 13, `hint-size` 11 |
| `support.js` script tags | 17 | Referenced by every board, absent from the repository; the user supplies it as a test-only Baseline asset (precondition P1) |
| `codegen.js` script tags | 17 | Mock code generator, never shipped |
| `StripCode.make` call sites | 5 | Home (specimen), Main, ReceiveState (viewfinder), SendPaper (tiles), SendScreen (stage). The brief counted 10; the files hold 5 call sites |
| Dynamic ARIA values | 4 `aria-label` interpolations | Ring "Progress {pct} percent", tile label, plus the ring arc `d` computed from percent (Main, ReceiveState, ErrorState) |
| `disabled` bound to state | 1 | Receive primary button in `verify` |
| Mobile variants | 6 files plus a gallery | The mobile files import the desktop board with `mobile="yes"`, which sets root class `page--m` (390 px pin); production relies on `@container page (max-width: 760px)` |
| `strip.css` | 393 lines | No `@font-face`, no `url()`; `@page { margin: 0 }`; print rules for `.paper`; `.paper--letter` is preview only |

## Appendix C: Conflicts between the boards and the codec and symbols specs

| # | Board (file) | Board says | Real value or spec | Handling |
|---|---|---|---|---|
| C1 | Send.dc.html | "96 packets + repair · ≈ 15 s loop at 8 fps" for a 184 KB file | 184 KB (188,416 bytes): K = 111, T = 149 at packetSize 1732 (blockSize 1702); 96 blocks would be about 160 KB | Template kept, numbers computed (Requirement 2, criterion 7) |
| C2 | Send.dc.html | "27 codes · 3 pages · black on white" | 149 codes; 17 pages at 9 per page, 13 at 12, 25 at 6 | Computed; page density is Resolved question 14 |
| C3 | SendScreen.dc.html | "Packet 38 of 96 + repair"; 45-module code (v7) in a 560 px stage | v30, 145 modules including the quiet zone; Medium 560 CSS px gives 3.86 px per module | Computed; Resolved question 13 |
| C4 | SendPaper.dc.html | 33-module tiles with a 3-module quiet zone, 9 per page, "27 codes · 9 per page", "Print 3 pages", "Page 1 / 3" | v30 symbols with a 4-module quiet zone (symbols R2.3 rejects below 4); T codes, N pages | Computed; 4-module quiet zone |
| C5 | ReceiveState.dc.html | "Blocks solved 36 / 96", "Packets seen 52", "All 96 blocks solved" | Counters come from the codec Decoder (solvedBlocks, totalBlocks, distinctPackets) | Computed |
| C6 | ErrorState.dc.html | "256 KB limit", "1.4 MB file", "71 of 96", ring 74% | Computed; also 71 / 96 is 73.96% and the board shows 74, while 36 / 96 is 37.5% and the board shows 37, so no single rounding rule fits both | The App uses floor (never 100 before complete) |
| C7 | Board numbers | K = 96 for a 184 KB file | 188,416 / 96 = 1,963 bytes per block; neither packetSize 2953 (blockSize 2923) nor 1732 (blockSize 1702) gives K = 96 | The mock is internally inconsistent; all numbers computed |
| C8 | Receive | One code at a time in the viewfinder | A printed page holds up to 9 codes (board grid) and the reader returns one symbol per frame (`maxNumberOfSymbols` 1) | Multi-symbol decoding is required (Resolved question 11); the symbols amendment is dependency D2 |
| C9 | Receive | No control to add image files | The scope requires image intake | Design addition (Resolved question 15) |
| C10 | SendScreen | Only the playing state; no step mode, no Play label, no full-screen control | The scope requires pause, step mode under reduced motion, full screen | Design additions (Resolved question 15) |
| C11 | strip.css, SendPaper | `@media print` fixes `.paper` at 210 mm by 297 mm and `@page` has no size; `.paper--letter` is preview only | "Letter" cannot be set by an inline style under the CSP | Resolved question 14 |
| C12 | SendPaper | Header has name, meta and "PAGE 1 / 3" | The scope requires the session id short form in the printed header | Design addition (Resolved question 15) |
| C13 | ReceiveState | "Expected 9f2c 41ab e07d…, got 31d8 aa02 5c19…" | Before the amendment the codec Decoder returns only HASH_MISMATCH and exposes neither digest | Codec amendment adds the 12-digit digest prefixes (Resolved question 18; dependency D1) |
| C14 | ReceiveState | HUD "Session 7F3A ≠ 4C21" (4 hex digits) | The codec Session_Id is 32 bits (8 hex digits) | Resolved question 19 |
| C15 | ReceiveState, ErrorState | 3 Error kinds plus the Receive banners | 10 codec codes, 4 symbols codes, 4 ignore reasons, 4 outcome kinds; no board message for BAD_CRC, BAD_HEADER, UNSUPPORTED_VERSION, BAD_METADATA, INVALID_INPUT, ENCODE_FAILED, UNSUPPORTED_ENVIRONMENT, INCOMPLETE_DECODE | Appendix E; added kinds of Requirement 7, criteria 10 and 11 (Resolved question 16) |
| C16 | symbols R9.3, R9.5 | The Strip_CSP leaves `worker-src` unset (falls back to `default-src 'self'`) | The scope requires `worker-src 'self'` explicit | Resolved question 20; `STRIP_CSP` unchanged; the symbols amendment is dependency D3 |
| C17 | strip.css | "Code playback is data, not decoration, and keeps its frame rate" under reduced motion | The scope requires reduced motion respected for the stream | Handled in App logic (Requirement 11, criteria 8 and 9) |
| C18 | Board SVG | `svg.code` with `rect.code__bg` and `path.code__ink` classes | `renderToSvg` returns a string with `fill` attributes and no classes, and `role` and `aria-label` are absent | Extract `d` and `viewBox` from the string with a pinned unit test (Resolved question 15) |
| C19 | About.dc.html | "Max file size 256 KB"; "Close the tab and the session is gone" | The cap is 256 KB (Resolved question 10); the session statement is true only while nothing is persisted (Requirement 16) | Copy is verbatim; the cap is computed |
| C20 | Send.dc.html | SHA-256 chip shows 12 hex digits before encoding | `sha256WebCrypto` is the function the codec uses | No conflict (Requirement 2, criterion 5) |
| C21 | Send.dc.html | Continue button "Continue to Screen" only | A Paper choice needs its own label | "Continue to Paper" derived (Resolved question 15) |
| C22 | Home and Receive boards | Link texts to `*.dc.html` | Routes | Translated (Requirement 8, criterion 5) |
| C23 | Errors.dc.html | Camera board says "Camera API: Missing" | `NotFoundError` (no camera device) is a different cause | New kind `nocamera` with the copy of Requirement 7, criterion 10 (Resolved question 16) |
| C24 | design/project | `strip.css` is at `design/project/strip.css` | The brief wrote `design/strip.css`; the steering was corrected | Real path used |
| C25 | Main.dc.html | Self-host both families under the CSP | `strip.css` has no `@font-face` | Fonts_Stylesheet and Additions_Stylesheet beside a byte-identical `strip.css` (Resolved question 17) |
| C26 | symbols R15.5 | The app links to THIRD_PARTY_NOTICES | The boards have no such link | Design addition (Resolved question 15) |
| C27 | codec spec, zod | Zod carries an eval feature probe that trips a strict CSP | `zod` 4.6.7 is a dependency of `apps/strip` | Resolved question 30 |
| C28 | Receive board | 4:3 or square viewfinder with a mock tilted code | The viewfinder needs a `<video>` element and a canvas, absent from the boards | Design addition (Resolved question 15); the mock code is not shipped |

## Appendix D: Receive phase copy (verbatim from ReceiveState.dc.html)

Numbers marked {…} are computed. The ring percent, packets seen and blocks solved are the values of Requirement 12, criterion 7.

| Phase | Tag (class) | Heading | Message | Primary (class) | Secondary | HUD or note | Banner and extras |
|---|---|---|---|---|---|---|---|
| `ask` | "Waiting for permission" (`tag`) | "Allow camera access" | "Strip reads codes with your camera. Video is processed on this device and never recorded or sent." | "Allow camera" (`btn btn--primary btn--lg btn--block`) | "Not now" | note "Camera permission needed"; `vf--idle`; ring dim 0% | camera icon |
| `denied` | "Camera blocked" (`tag tag--signal`) | "Camera access denied" | "Your browser blocked the camera for this site. Allow it, then try again." | "Try again" (primary) | "Back" | note "Camera blocked"; `vf--idle vf--warn` | crossed camera icon; steps list of 3 |
| `scan` | "Scanning" (`tag tag--cobalt`) | "Keep the code in frame" | "Hold steady. Blocks solve as packets arrive; order does not matter." | "Stop scanning" (`btn btn--lg btn--block`) | "Start over" | HUD "Looking for packets"; torch when supported | – |
| `dup` | "Other session" (`tag tag--signal`) | "A different transfer is in view" | "Still solving the first file. {n} packets from another session were skipped." | "Keep current file" (primary) | "Switch to new" | HUD "Session {A} ≠ {B}"; `vf--warn` | banner `callout--warn`, title "Wrong or repeated code", text "Packets from session {A} do not belong to this file. Point the camera back at the original code, or switch."; torch when supported |
| `verify` | "Verifying" (`tag tag--cobalt`) | "Checking SHA-256" | "All {total} blocks solved. Comparing the file hash with the sender’s." | "Verifying…" (primary, `disabled`) | "Cancel" | HUD "Camera paused"; `vf--idle` | indeterminate `progress` "Verifying hash" |
| `done` | "Complete" (`tag tag--solid`) | "File received" | "Hash verified. The file is ready to save to this device." | "Save file" (`btn btn--cobalt btn--lg btn--block`, download icon) | "Receive another" | `vf--done`: name, size, tag "SHA-256 match · {12 hex}…" | – |
| `failed` | "Verification failed" (`tag tag--signal`) | "File does not match" | "The file may be incomplete or a block was misread. Nothing was saved. Scan again from the start." | "Scan again" (`btn btn--signal btn--lg btn--block`) | "Discard" | HUD "Camera paused"; `vf--idle`; ring `ring--bad` | banner `callout--error`, title "Hash mismatch", text "Expected {e1} {e2} {e3}…, got {a1} {a2} {a3}…" (the first 12 hex digits of the expected and actual SHA-256 in 3 groups of 4; Resolved question 18) |

Targets of the buttons (Requirement 5, criterion 10; assumptions listed in Resolved question 28): `ask` Allow camera starts the camera, Not now goes to `/`; `denied` Try again requests the camera, Back goes to `/`; `scan` Stop scanning stops the camera and returns to `ask`, Start over resets the Scan_Session and stays in `scan`; `dup` Keep current file returns to `scan`, Switch to new resets and returns to `scan`; `verify` Cancel resets and returns to `ask`; `done` Save file downloads, Receive another resets and returns to `ask`; `failed` Scan again resets and returns to `scan` (after the camera is requested again), Discard resets and returns to `ask`.

## Appendix E: Error code to board state mapping

| Source | Code or condition | Disposition |
|---|---|---|
| Codec ErrorCode | PAYLOAD_TOO_LARGE | Error_Panel `size` (sender, verbatim). On the receiver, a stream above FILE_CAP_BYTES: Error_Panel `limit` |
| Codec ErrorCode | TOO_MANY_BLOCKS | Same as PAYLOAD_TOO_LARGE |
| App file-size cap | size above FILE_CAP_BYTES | Error_Panel `size` (verbatim) |
| Codec ErrorCode | SESSION_MISMATCH | Receive `dup` |
| Codec ErrorCode | HASH_MISMATCH | Receive `failed` |
| Codec ErrorCode | BAD_CRC | Silent, not shown (a damaged or foreign QR code); counted for the `#diag` readout |
| Codec ErrorCode | BAD_HEADER | Silent, not shown, as BAD_CRC |
| Codec ErrorCode | UNSUPPORTED_VERSION | Error_Panel `format` |
| Codec ErrorCode | BAD_METADATA | Error_Panel `filename` (sender variant: file name not accepted; receiver variant: recovered metadata unreadable) |
| Codec ErrorCode | INVALID_INPUT | Internal: Error_Panel `unexpected` |
| Codec ErrorCode | INCOMPLETE_DECODE | Never reachable (Requirement 13, criterion 7); no copy needed |
| Codec Ignore_Reason | DUPLICATE_PACKET | Silent; not counted in "Packets seen" |
| Codec Ignore_Reason | SESSION_MISMATCH | Receive `dup`, skipped counter |
| Codec Ignore_Reason | ALREADY_COMPLETE | Silent |
| Codec Ignore_Reason | DENSE_STORE_FULL | Silent |
| SymbolErrorCode | INVALID_INPUT | Internal: Error_Panel `unexpected` |
| SymbolErrorCode | PACKET_TOO_LARGE | Internal (cannot occur at packetSize 1732): Error_Panel `unexpected` |
| SymbolErrorCode | ENCODE_FAILED | Error_Panel `draw` (sender: could not draw the code) |
| SymbolErrorCode | UNSUPPORTED_ENVIRONMENT | Error_Panel `reader` (worker, canvas or WebAssembly unavailable) |
| DecodeOutcome | not_found, not_strip_packet, dropped | Silent |
| Camera | `navigator.mediaDevices` or `getUserMedia` absent | Error_Panel `camera` (verbatim) |
| Camera | `NotAllowedError`, `SecurityError` | Receive `denied` |
| Camera | `NotFoundError`, `NotReadableError`, `OverconstrainedError`, `AbortError` | Error_Panel `nocamera` (no device, or camera in use; never the kind `camera`) |
| App | No new solved block for STALL_TIMEOUT_MS | Error_Panel `stall` |
| App | Any other exception | Error_Panel `unexpected` |

## Resolved questions

1. **Default cell.** Screen and print both use version 30, ECC_Level L, packet size 1732 bytes and at least 4 pixels per module (symbols Resolved questions 6 and 7, decision A). The App passes `packetSize: 1732` to the codec.
2. **CSP base.** The symbols Strip_CSP (symbols Requirement 9, criterion 3) is the base of the App_CSP, delivered as an HTTP header, kept in `apps/strip/src/csp.ts` as the single source.
3. **Design hand-off rules.** The design-handoff steering applies unchanged: boards are source markup, `strip.css` is copied, fonts are self-hosted, the mock generator and design runtime are never shipped, Template_Constructs are translated and reported, the CSP forbids inline styles, and the Fidelity_Gate fails the task on a diff over 1% with QR regions masked. The steering path of the stylesheet is `design/project/strip.css`.
4. **No encryption in v1.** The About board states "Strip does not encrypt" and that copy stays.
5. **React is the conversion target** (design-handoff steering; Resolved question 24 covers its approval).
6. **Decode in a same-origin module worker** (symbols Open question (c)): `apps/strip/src/decode.worker.ts` and `decode-client.ts` exist and are reused; the wasm URL comes from `@strip/symbols/wasm-url`.
7. **Scope.** Paper is the primary path; the screen path, camera input and image-file input are in scope; accounts, encryption, compression, cloud, native apps and a WebRTC fallback are out of scope.
8. **Size unit.** The boards use 1 KB = 1024 bytes (184 KB is 188,416 bytes), so "256 KB" is 262,144 bytes.
9. **Time.** Only `apps/strip/src/clock` reads time (tech steering).
10. **File cap and paper warning.** FILE_CAP_BYTES is 262,144 bytes (256 KB); the verbatim copy stays. Evidence: at packetSize 1732 a 256 KB file is K = 155, T = 200, 23 pages on the 9-per-page grid, a 25.0 s lap at 8 fps; the codec limits (32 MiB, 16384 blocks, 1024 Gaussian blocks) are far above it. The paper shows a warning above PAPER_WARN_BYTES = 65,536 (64 KB), where T = 67 and N = 8; the warning copy is derived and listed in Requirement 9, criterion 8. Decided by the user.
11. **Pages with many symbols.** Multi-symbol decoding is REQUIRED, for photos and scans of printed pages and for the live camera seeing a printed page. Evidence: a page holds 9 symbols on the board grid and the reader returns one per frame today (`maxNumberOfSymbols` 1). The App requirement is written against the symbols capability generically (the receiver obtains every symbol in an image through `@strip/symbols`; the result shape and option name come from the symbols spec amendment, cited by id once it exists). The acceptance target stays: the page-photo end-to-end path feeds page images with all 9 symbols per page and the file is rebuilt byte-identical. The spike `docs/spikes/symbols-multi.md` gates this (first choice a multi-symbol option in `decodeFrame`, fallback app-side tiling of overlapping windows), and the symbols spec, design and tasks are amended afterwards (dependency D2). Decided by the user.
12. **Image intake limits.** One image at a time; at most IMAGE_MAX_PIXELS = 16,777,216 pixels (4096 × 4096, 67 MB as RGBA), larger images are resized to a 4096 px long side; at most IMAGE_MAX_COUNT = 100 images per session; at most IMAGE_MAX_FILE_BYTES = 26,214,400 bytes (25 MB) per file. Evidence: a 12 MP photo is 48 MB as RGBA; a 4000 px photo of an A4 page gives about 7.7 px per module on the board grid. The Decode_Worker photo mode takes a 4096 × 4096 maximum; the camera keeps 1920 × 1080. Decided by the user.
13. **Screen symbol version.** Version 30 stays for the screen path. Evidence: 145 modules with the quiet zone; Small, Medium and Large give 2.62, 3.86 and 5.24 CSS px per module; at 70% of the short side of the frame, 720p gives about 3.5 camera px per module and 1080p about 5.2. The real-device check (`docs/device-test.md`) decides later whether to move the default. Decided by the user.
14. **Printed layout and Letter.** The board 9-per-page 3 × 3 grid stays (about 58.8 mm per code on A4, 0.405 mm per module, 4.8 dots at 300 dpi; about 60.5 mm on Letter). Letter paper switches through the CSSOM (an inserted `@page` rule and print `.paper` rule); there is no inline style and no `style` attribute (Requirement 10, criterion 10). Decided by the user.
15. **Design additions.** The missing controls and states are approved and added as the minimal classes and elements in the Additions_Stylesheet: add images on Receive; Play, Step and full-screen controls on Stream_View; manual Step_Mode; the viewfinder `<video>` and canvas; the empty and drag-over states on Send; the notices link; the session id in the printed header; Letter handling; the `#diag` readout; the no-camera message; and the derived copy formats ("Continue to Paper", "Print 1 page", singular skipped-packet text, "0 / 0", size rounding, the Home specimen, route titles). The board `svg.code` structure is produced by extracting `d` and `viewBox` from the `renderToSvg` string with a pinned unit test. Each addition is listed in the task report and carries `data-addition` (Requirement 20, criterion 8). Decided by the user.
16. **Copy for codes without a board message.** New Error_Panel kinds are approved, with copy in the tone of the board (plain, specific, blames nothing, one next step), listed verbatim in Requirement 7, criteria 10 and 11: `format`, `filename`, `draw`, `reader`, `unexpected`, `limit`. The camera fault is fixed: the board text "Camera API: Missing" is shown only for a missing camera API (kind `camera`), and NotFoundError, NotReadableError, OverconstrainedError and AbortError show the new kind `nocamera` ("No camera found"). The paper warning, the photosensitivity notice and the image notices are derived copy in Requirements 9 and 3. Decided by the user.
17. **Stylesheet and additions.** `strip.css` stays byte-identical to `design/project/strip.css`, proved by a unit test that compares the SHA-256 of the shipped copy with the design file. The `@font-face` rules go in the Fonts_Stylesheet (`fonts.css`) and every other addition in the Additions_Stylesheet (`strip-additions.css`): two sibling files. Decided by the user.
18. **Hash mismatch digests.** A HASH_MISMATCH rejection carries the first 12 hex digits of the expected and of the actual SHA-256, exposed on the Decoder; the `failed` banner shows "Expected xxxx xxxx xxxx…, got xxxx xxxx xxxx…" in the board's grouping. The codec amendment is made in the codec spec before the App tasks (dependency D1). Decided by the user.
19. **Session short form.** The first 4 uppercase hex digits of the 32-bit Session_Id (the board shows 4), or 8 digits when two forms in view would be equal; the printed header uses the 4-digit form. Decided by the user.
20. **App CSP and headers.** The App_CSP is the symbols CSP string plus `worker-src 'self'`: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. The App also sends `Permissions-Policy: camera=(self)`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`. Symbols Requirement 9, criteria 3 and 5 are amended separately (dependency D3). Decided by the user.
21. **Routes.** `/`, `/send`, `/send/screen`, `/send/paper`, `/receive`, `/about`. The Errors and ReceiveStates galleries are Harness_Build routes only (`/__gallery/*`) and absent from the production bundle. Unknown paths go to `/`. Decided by the user.
22. **Fidelity baseline source.** `support.js` is not in the repository (all history was checked). The user supplies it from the original export; it is placed in `design/project/` as a test-only Baseline asset, never shipped and excluded from lint. No custom renderer is written. This is precondition P1 of the Fidelity_Gate task, status: awaiting support.js from the user. The Baseline uses the fixture "field-notes-2026.pdf" of 188,416 bytes so the size text equals the board. Decided by the user.
23. **Repository URL.** REPO_URL is `https://github.com/alwayskumar-global/strip`, used for the three GitHub links (Home footer, About footer, About credits button) as navigations with `rel="noopener"` only. Decided by the user.
24. **Dependencies.** Approved: `react`, `react-dom`, `@types/react` and `@types/react-dom`, each pinned exactly with its row in `docs/dependencies.md` in the task that adds it. The router and the service worker are hand-written (no router library, no Workbox); Vite's own JSX transform is used and `@vitejs/plugin-react` is not approved; there is no DOM-emulation test library. Decided by the user.
25. **PWA decisions.** The update policy is that a new worker waits and takes over when all windows close; icons (192, 512 and maskable 512) derive from the brand mark of the boards; `background_color` and `theme_color` are `#F7F5EF` (`--paper-50`); the `.wasm` is precached at install, because offline needs it. Decided by the user, as proposed.
26. **First-load budget.** At most 400 KB gzip for the assets the first visit to `/` loads, excluding the 946,598-byte `.wasm` and the decode worker; revisited after the first Bundle_Report. Evidence: `strip.css` is 393 lines (about 33 KB raw) and the fonts are the largest line. Decided by the user.
27. **Stream details.** A lap is T Packets at the default speed; the stream continues with further repair Packets from `next()`; the counter continues past K while the progress bar stops at K (Requirement 11, criterion 17). Because rapid black and white change of a large area at up to 15 Hz can fall under the WCAG three-flashes concern, the Send-on-screen view shows the Photosensitivity_Notice (Requirement 3, criterion 13), and `prefers-reduced-motion` makes the stream default to Step_Mode, so it does not auto-play (Requirement 11, criterion 8). Decided by the user.
28. **Receive behaviour not in the boards.** Stall applies only after the first accepted Packet; `verify` is shown only if a push is pending for more than 100 ms (hashing 256 KB takes a few milliseconds); `dup` is left when a Packet of the current session is accepted; the camera is released on `verify`, `done` and `failed`; `ask` is always the first state with no automatic prompt; Stop scanning returns to `ask`. Decided by the user, as proposed.
29. **Device-check readout.** The `#diag` readout is in the production bundle, with a minimal text readout, so the real HTTPS host and CSP can be checked on a phone (Requirement 12, criterion 18). Decided by the user, as proposed.
30. **Zod and the CSP.** The App does not use `zod` in v1, because its eval probe is reported by a strict CSP; the few App inputs are validated by hand, as the codec and symbols do (Requirement 22, criterion 6). Decided by the user, as proposed.

## Open questions

None yet.
