# Requirements Document

## Introduction

Strip is a client-side PWA, sender and receiver in one app, that turns a file into a printable strip (paper path, primary: the 1985 Cauzin Softstrip idea rebuilt) or an animated on-screen code sequence (screen path), and rebuilds the file from a phone camera or from photos and scans of the printed pages. This spec covers `apps/strip` (`@strip/app`): every screen, the sender and receiver pipelines, the PWA shell, the delivery headers, privacy, accessibility, performance gates and the design fidelity gate. It does not restate the codec (`@strip/codec`, spec `.kiro/specs/codec`) or the symbols package (`@strip/symbols`, spec `.kiro/specs/symbols`); it consumes their public barrels, plus the one documented `@strip/symbols/wasm-url` subpath.

Everything runs client-side. There is no backend, no account, no network use at runtime (after the first load, one same-origin request set only), no encryption in v1, no native app and no cloud service. The dependency direction `codec <- symbols <- app` is unchanged.

The source of every screen is the design folder `design/project`: design export 2, with 34 `*.dc.html` boards (32 screen, state and component boards, the design-system board Main and the Symbol placeholder), `strip.css`, `canvas.json`, `index.html`, `codegen.js` and `support.js`. The boards are converted to React components, keeping class names, text, element structure and ARIA text (steering: design-handoff). Design export 2 contains the controls and states that export 1 lacked (image input, distinct-packet meter, stream controls, Send states, paused and step modes, full screen, Letter, the photosensitivity notice, the session id, the no-camera phase, 14 error kinds), and its numbers for the sample file are consistent with the codec (184 KB = 188,416 bytes = 111 source packets, 149 symbols, 17 pages at 9 per page). The boards still carry instance values (for example the Receive counters, "28 MB" and "24 / 24") that the App computes; the App keeps the board's text templates verbatim (Appendix C lists each remaining conflict). Every decision taken by the user is recorded under Resolved questions. Requirements refer to decided values by a named constant (for example FILE_CAP_BYTES) so that each value has one definition. Work that other specs must do first is listed under Dependencies on other work.

Each acceptance criterion ends with a tag naming how it is verified: [unit] (fast example or table test in `pnpm test`), [property] (fast-check property in `pnpm test`), [measured] (seeded or batch run outside the fast suite), [perf] (perf script), [Playwright] (bundled Chromium test against a localhost harness or the production build) and [manual] (recorded human check).

## Glossary

- **App**: The package `@strip/app` in `apps/strip`, the PWA.
- **Board**: One `*.dc.html` file in `design/project`. Main.dc.html is the design-system board and Symbol.dc.html is the placeholder symbol; neither is a screen.
- **Stylesheet**: `design/project/strip.css`. The App ships a copy that equals the design file byte for byte; it is never edited or appended to (Resolved question 17). `tools/design.test.ts` pins the design file at SHA-256 `e8d66a6a098a6fa51fa3a6fe9ad01f2445e2a8400818e84192b142fbe8cd6d37`, and the App has its own hash test for its copy (Requirement 19, criterion 2).
- **Fonts_Stylesheet**: The sibling file `fonts.css`, in the directory that holds the shipped copy of the Stylesheet, containing only the `@font-face` rules of the self-hosted IBM Plex families (the Stylesheet has no `@font-face`).
- **Additions_Stylesheet**: The sibling file `strip-additions.css`, in the same directory, containing only the rules listed in Requirement 19, criterion 8 (the Stylesheet now carries its own "ADDITIONS (revision 2)" block and the `body { margin: 0 }` rule, so the earlier approved additions are no longer needed).
- **Route**: A URL path served by the App. The routes are in Appendix A (Resolved question 21).
- **Home_View**, **Send_View**, **Stream_View**, **Paper_View**, **Receive_View**, **About_View**: The App views for Home, Send step 1, Send on screen, Send on paper, Receive and About.
- **Send_State**: One of `chosen`, `empty`, `toolarge`, `emptyfile`, the values of the prop `stage` of Send.dc.html (boards Send, SendEmpty, SendTooLarge, SendEmptyFile).
- **Stream_Mode**: One of `play`, `paused`, `step`, the values of the prop `mode` of SendScreen.dc.html. **Step_Mode** is the Stream_Mode `step`: the Stream_Player never advances on a timer and shows exactly the next or the previous Packet per activation of Next or Previous.
- **Full_Screen_State**: The Stream_View state rendered from SendScreenFull.dc.html (`div.strip.fs`).
- **Error_Panel**: The App component converted from ErrorState.dc.html, with the prop `kind` of `size`, `empty`, `imgread`, `imgbig`, `imgmany`, `nocode`, `denied`, `nocamera`, `nothing`, `otherfile`, `hash`, `internal`, `camera` or `stall` (the 14 board kinds; Appendix F).
- **Receive_Phase**: One of `empty`, `ask`, `denied`, `nocam`, `scan`, `repeat`, `dup`, `verify`, `done`, `failed`, the values of the prop `phase` of ReceiveState.dc.html (Appendix D).
- **Sender_File**: The one file chosen on Send_View: bytes held in memory, name, MIME type and size.
- **FILE_CAP_BYTES**: The maximum Sender_File size in bytes. The value is 262,144 (256 KB; the board's KB is 1024 bytes, as 184 KB is 188,416 bytes; Resolved question 10).
- **PAPER_WARN_BYTES**: 65,536 (64 KB). A Sender_File above this size shows the paper warning (Requirement 9, criterion 8). The warning is not in the design (a derived addition; Appendix C, row C29).
- **Default_Cell**: The symbols default cell: version 30, ECC_Level L, packet size 1732 bytes, minimum 4 pixels per module (`QR_DEFAULTS`).
- **K**: The codec block count of the Sender_File's Encoder (the source packet count). **T**: The count of codes on paper, `K + pageRepairCount(K)`, the length of `page()`; the App computes T for display without encoding, through the codec export `pageRepairCount` (Resolved question 33).
- **PER_PAGE**: The number of codes on one printed page. The board grid is 3 columns by 3 rows, so PER_PAGE is 9 (Resolved question 14).
- **Tile**: One code with its caption on a printed page (`figure.tile`).
- **Print_Sheet**: One `article.paper` element, A4 (210 mm by 297 mm) or Letter (215.9 mm by 279.4 mm) in print.
- **Stream_Player**: The App logic that calls `encoder.next()` on a timer and shows each Packet as one code.
- **FPS_MIN, FPS_MAX, FPS_DEFAULT**: 2, 15 and 8, the `min`, `max` and `value` of the Speed range in SendScreen.dc.html.
- **STEP_HISTORY**: 256, the number of most recent Packets the Stream_Player keeps in memory so that Previous can show an earlier Packet (the largest T at FILE_CAP_BYTES is 200). A derived value (Appendix C, row C31).
- **Symbol_Component**: The App React component that replaces Symbol.dc.html (Requirement 19, criterion 12).
- **Frame_Loop**: The App camera loop: video frame to bitmap to the decode worker, with at most one decode in flight.
- **Decode_Worker**: The same-origin module worker `apps/strip/src/decode.worker.ts` that owns the symbols Frame_Decoder, spoken to through `decode-client.ts` and the message protocol in `decode-protocol.ts` (messages `init`, `frame`, `bitmap`, replies `ready`, `init-error`, `outcome`, `error`).
- **Terms from the other specs**: Packet, Metadata, Metadata_Record, Session_Id, Encoder, Decoder, Ignore_Reason and ErrorCode (codec spec); Symbol_Matrix, Quiet_Zone, Frame_Decoder, SymbolError, Perf_Method and Reference_Machine (symbols spec). They keep their meaning there.
- **Image_Intake**: The App input for image files (photos or scans of printed pages): `label.btn.picker` with `input type="file" accept="image/*"` in ReceiveState.dc.html, one image per pick, with the Photo_List.
- **Photo_List**: The `div.photos` block of ReceiveState.dc.html: the header "Added photos", the count tag, one `li.photo` row per added image (name, "{found} symbols found", remove button) and the empty-state hint.
- **IMAGE_MAX_FILE_BYTES**, **IMAGE_MAX_COUNT**, **IMAGE_LONG_SIDE**: 20,971,520 (20 MB, with the board's 1024-byte KB), 24 and 4096 (Resolved questions 12 and 32). The board templates "photos up to 20 MB can be read" and "n / 24" carry the same values (Appendix C, row C36).
- **Multi_Symbol_Read**: The `@strip/symbols` capability to return every symbol found in one image: the option `maxSymbols` of `decodeFrame` and `createFrameDecoder`, with the outcome `found_many` (`symbols`, `skipped`); dependency D2, done.
- **Scan_Session**: One codec Decoder instance plus the App counters (Packets_Seen, packets skipped from other sessions, time of the last new block, time of the last `found` outcome) and the in-memory list of Packets accepted from each source (camera, each photo) that Requirement 12, criterion 24 needs.
- **Packets_Seen**: The App counter shown as "Packets seen": the number of Packets pushed to the Scan_Session whose push status is `accepted` or `ignored` (any reason). The "Distinct packets" meter shows `progress().distinctPackets`, a different number (Requirement 12, criterion 7).
- **Session_Short**: The display form of the codec Session_Id (the first 4 uppercase hexadecimal digits of the Session_Id, or all 8 digits of each when two forms in view would be equal; Resolved question 19).
- **STALL_TIMEOUT_MS**: 20000, the "20 seconds" of the `stall` kind. **NOTHING_TIMEOUT_MS**: 30000, the "30 seconds" of the `nothing` kind. **REPEAT_HOLD_MS**: 1500, the longest time the `repeat` phase stays without a new duplicate (PROPOSED, derived; Appendix C, row C32).
- **App_CSP**: The Content Security Policy the App delivers: `APP_CSP`, defined as `STRIP_CSP`, which already contains `worker-src 'self'` (Requirement 15, criterion 1).
- **Strip_CSP**: The symbols CSP string of symbols Requirement 9, criterion 3, exported as `STRIP_CSP` from `apps/strip/src/csp.ts`.
- **Request_Log**: The list of every network request (including service worker and worker requests) recorded by a Playwright test.
- **Harness_Build**: The localhost test build of the App that includes the dev and test-only gallery routes. The production bundle contains no gallery route.
- **Fidelity_Gate**: The Playwright screenshot-diff test of Requirement 20.
- **Baseline**: The reference screenshot rendered from the original design HTML in Chromium by the design runtime `support.js`.
- **QR_Mask**: A rectangle painted over every code region (`svg.code`, `.stage__code`, `.fs__code`, `.vf__code`, the viewfinder video) in both Baseline and App screenshot before diffing.
- **Template_Construct**: A Claude-Design template construct: `{{ }}`, `sc-for`, `sc-if`, `dc-import`, `x-dc`, `helmet`, `data-dc-script` component classes (DCLogic), `hint-*` attributes.
- **Bundle_Report**: The build output listing every emitted asset with raw, gzip and brotli sizes and the totals.
- **First_Load_Budget**: The transfer budget of Requirement 18, criterion 2: 400 KB gzip, to be revisited after the first Bundle_Report (Resolved question 26).
- **THIRD_PARTY_NOTICES**: The static file `apps/strip/public/THIRD_PARTY_NOTICES` of symbols Requirement 15, linked as `/THIRD_PARTY_NOTICES` from Home_View and About_View.
- **REPO_URL**: `https://github.com/alwayskumar-global/strip` (Resolved question 23).
- **Photosensitivity_Notice**: The `div.callout.callout--warn[role="note"]` of SendScreen.dc.html (Requirement 3, criterion 13), in the design's own words.

## Requirements

### Requirement 1: Home screen (route `/`)

**User Story:** As a first-time visitor, I want to see what Strip does and pick Send or Receive in one tap, so that I reach the right flow without reading anything else.

#### Acceptance Criteria

1. WHEN the route `/` is requested, THE App SHALL render Home_View converted from Home.dc.html with the board's class names, element structure, text and ARIA text, and with no nav link carrying `aria-current`. [Playwright]
2. THE Home_View SHALL contain, verbatim from Home.dc.html: the label "No network · No account · No upload", the heading "Move a file between devices with just light.", the lead paragraph, the Send card (link to `/send`, label "I have a file", heading "Send", action "Choose a file"), the Receive card (link to `/receive`, label "I see a code", heading "Receive", action "Open camera"), the "How it works" list with steps "Pick a file", "Show the code" and "Scan it", and the footer text "Built with Kiro". [Playwright]
3. THE Home_View SHALL render the specimen figure with 6 Symbol_Components (`aria-label` "Sample data code") drawn from the 6 Packets with sequence numbers 0 to 5 of a fixed built-in sample set, in place of the mock codes of codegen.js; THE sample set SHALL be the Encoder of a deterministic payload of 188,416 bytes named "field-notes-2026.pdf" with MIME "application/pdf" (the Fidelity_Gate fixture, generated from the seeded PRNG so that no sample bytes ship), THE specimen head SHALL show "field-notes-2026.pdf" and "Page 1 / {N}" with {N} computed from that set (17), and THE caption "Sample strip · 6 of 9 codes shown" SHALL stay static text. [unit]
4. FOR ALL 6 specimen codes, rasterizing the code at 4 pixels per module and decoding it with `decodeFrame` SHALL return a Packet that `decodePacket` accepts. [Playwright]
5. THE Home_View footer SHALL link "About & privacy" to `/about`, "Third-party notices" to `/THIRD_PARTY_NOTICES` and "GitHub" to REPO_URL (with `rel="noopener"`), each a navigation and not a fetch; the link to THIRD_PARTY_NOTICES satisfies symbols Requirement 15, criterion 5. [unit]
6. WHILE the container width of `.page` is at most 760 px, THE Home_View SHALL use the layout rules of the Stylesheet container query `@container page (max-width: 760px)`, and THE root class `page--m` SHALL be used only by the Harness_Build for the mobile Fidelity_Gate target. [Playwright]
7. THE Home_View SHALL have a single state and SHALL request no network resource other than the App's own assets. [Playwright]

### Requirement 2: Send step 1 screen (route `/send`)

**User Story:** As a sender, I want to choose a file and an output, so that I know the size, hash and cost (packets, symbols, pages, loop time) before I show or print it, and so that a file that cannot be sent is explained at once.

#### Acceptance Criteria

1. WHEN the route `/send` is requested, THE App SHALL render Send_View converted from Send.dc.html with the board's class names, structure, text and ARIA text: crumbs "1 File & output" (`aria-current="step"`) and "2 Show or print", heading "Send a file", the drop section, the file card of the current Send_State (`chosen`, `empty`, `toolarge` or `emptyfile`), the output fieldset and the action bar. [Playwright]
2. WHEN the user drops a file on the drop section or chooses a file with `input#file`, THE App SHALL use only the first file when several are given, SHALL derive the Send_State from `File.size` before reading any byte, and SHALL read the bytes into memory as the Sender_File only in the Send_State `chosen`. [Playwright]
3. THE Send_View SHALL show the drop-zone hint "Max {cap} KB · one file", where {cap} is FILE_CAP_BYTES divided by 1024. [unit]
4. WHILE the Send_State is `chosen`, THE Send_View SHALL show the file card with: the file name (`h2.filecard__name`), the MIME type, a "Remove file" button, the row "Size" as "{n} KB" followed by "{bytes} bytes" with thousands separators (for 188,416 bytes: "184 KB" and "188,416 bytes"), the row "SHA-256" as the `span.hash` of three 4-digit groups of the first 12 hexadecimal digits, each in its own `span`, followed by a `span` "…", the row "Encoded" as "{K} packets · {T} symbols" (the board shows "111 packets · 149 symbols"), the row "Within limit" as "{n} of {cap} KB", and a `progress` with `value` n, `max` {cap} and the label "Share of the 256 KB limit used" (the number computed from FILE_CAP_BYTES), where n is the size in KB rounded up to an integer. [unit]
5. THE Send_View SHALL compute the SHA-256 shown in the file card with the codec export `sha256WebCrypto`, the same function the codec uses, so that the chip equals the hash in the Metadata_Record. [property]
6. WHEN the user activates "Remove file" (in the Send_State `chosen`, `toolarge` or `emptyfile`), THE App SHALL drop every reference to the Sender_File bytes and return to the Send_State `empty`. [unit]
7. WHEN the Send_State is `chosen`, THE Send_View SHALL create a codec Encoder with packetSize 1732 and SHALL show the Screen choice line "{K} packets + repair · ≈ {s} s loop at 8 fps", where {s} is T divided by FPS_DEFAULT, rounded to an integer (the board shows "111 packets + repair · ≈ 14 s loop at 8 fps" for the 184 KB sample; the App shows "≈ 19 s", the real lap), and the Paper choice line "{T} symbols · {N} pages · black on white", where N is `ceil(T / PER_PAGE)` (the board shows "149 symbols · 17 pages · black on white"). The loop figure uses the real lap of T Packets and not K / fps as the board's arithmetic does; this is a deliberate deviation from the board text, listed in the task report (Appendix C, row C30; Resolved question 39). [property]
8. THE Send_View SHALL offer the radio group `name="output"` with values `screen` (checked by default in the Send_State `chosen` only) and `paper`, each with the board's heading and description text. [Playwright]
9. WHEN the user activates the primary action with `screen` selected, THE App SHALL navigate to `/send/screen`, and with `paper` selected, THE App SHALL navigate to `/send/paper`, and THE primary action label SHALL be "Continue to Screen" (the board) or "Continue to Paper" (derived from the board's pattern; Resolved question 15). [Playwright]
10. THE Send_View SHALL link the secondary action "Cancel" to `/`. [unit]
11. IF the Sender_File size exceeds FILE_CAP_BYTES, THEN THE Send_View SHALL enter the Send_State `toolarge` converted from SendTooLarge.dc.html: the drop section with the class `drop--error`, the file card `filecard--bad` with the file name, the MIME type and the "Remove file" button, the row "Size" as "{size} ({bytes} bytes)" (for 1,468,006 bytes: "1.4 MB (1,468,006 bytes)"), the row "SHA-256" as "Not computed", the row "Within limit" as "No, over by {over}" (for the example: "No, over by 1.2 MB"), `progress.progress--signal` (`value` 100, `max` 100, label "Share of the 256 KB limit used"), and the `callout callout--error` (`role="alert"`) with the title "File too large" and the text "{name} is {size}. Strip carries files up to {cap} KB, so compress it or split it into smaller files."; THE App SHALL NOT read the file bytes into memory. [Playwright]
12. WHEN a file of exactly FILE_CAP_BYTES bytes is chosen, THE App SHALL accept it (Send_State `chosen`), and WHEN a file of FILE_CAP_BYTES + 1 bytes is chosen, THE App SHALL enter the Send_State `toolarge`. [unit]
13. WHILE the Send_State is `empty`, THE Send_View SHALL show the drop section and the file card `filecard--empty` with the heading "No file chosen" and the text "Name, size and SHA-256 appear here once you pick a file." (the board's own empty state; drag-over feedback is not in the design and the App adds none; Appendix C, row C33). [Playwright]
14. IF File.type is empty or is not a valid codec MIME type (longer than 127 bytes or containing a byte above 0x7F), THEN THE App SHALL use the MIME type `application/octet-stream`. [property]
15. WHILE the container width of `.page` is at most 760 px, THE Send_View SHALL use the Stylesheet container query layout, and THE `page--m` root class SHALL be used only by the Harness_Build. [Playwright]
16. IF the Sender_File size is 0 bytes, THEN THE Send_View SHALL enter the Send_State `emptyfile` converted from SendEmptyFile.dc.html: the drop section with `drop--error`, the file card `filecard--bad` with the row "Size" as "0 bytes", the row "SHA-256" as "Not computed", the row "Within limit" as "n/a", `progress.progress--signal` (`value` 0, `max` {cap}, label "Share of the 256 KB limit used"), and the `callout callout--error` (`role="alert"`) with the title "File is empty" and the text "{name} has no content, so there is nothing to send. Choose a file with data in it." (a zero-byte file was accepted before design export 2; Appendix C, row C34). [unit]
17. WHILE the Send_State is `empty`, `toolarge` or `emptyfile`, THE Send_View SHALL set `disabled` on the output fieldset with no radio checked, and SHALL replace the primary action by `button.btn.btn--primary.btn--lg` with the label "Continue to Screen" and the attribute `disabled`. [Playwright]

### Requirement 3: Send on screen (route `/send/screen`)

**User Story:** As a sender in the same room as the receiver, I want an animated code that I can pause, step through, speed up or enlarge, so that a phone can read the file from my screen and nobody is harmed by the flashing.

#### Acceptance Criteria

1. WHEN the route `/send/screen` is requested while a Sender_File is set, THE App SHALL render Stream_View converted from SendScreen.dc.html with the board's class names, structure, text and ARIA text: the back link `aria-label="Back to file and output"` (to `/send`), the heading "Show on screen", the tags "{name} · {size} KB" and the mode tag, the Photosensitivity_Notice, the stage, the transport panel (counter, progress, play button, step controls, notes), the speed field, the code size fieldset and the tip callout "Hold the phone steady". [Playwright]
2. WHEN the route `/send/screen` is requested while no Sender_File is set, THE App SHALL navigate to `/send`. [Playwright]
3. THE Stream_View SHALL render each Packet as the Symbol_Component (Requirement 19, criterion 12) with the `aria-label` "Animated data code, packet {n} of {K}", inside `div.stage__code`, and the stage SHALL carry the `aria-label` "Animated code, frame {n}". [Playwright]
4. THE Stream_View SHALL show the counter as the label "Packet", the number {n}, the text "of {K} + repair" and the tag "Lap {L}", where {n} is the sequence number plus 1 and {L} is `floor((n − 1) / T) + 1` (Resolved question 27: a lap is T Packets), and a `progress` with `value` min({n}, K), `max` K and the label "Packet progress". [unit]
5. THE Stream_View counter SHALL keep `aria-live="off"`. [unit]
6. THE Stream_View SHALL show the transport button `btn btn--primary btn--lg btn--block` with the label "Pause" and the key hint `span.kbd` "Space" while the Stream_Mode is `play` and with the label "Play" and the same key hint in the Stream_Modes `paused` and `step`, the pause icon or the play icon of the board, and the text "After packet {K} the code keeps looping repair packets until you stop. A scanner can start at any point." [unit]
7. WHEN the user activates the transport button, or presses Space while focus is not on another interactive control, THE Stream_View SHALL hold the current code and enter the Stream_Mode `paused` from `play`, and SHALL enter `play` from `paused` or `step`. [Playwright]
8. THE Stream_View SHALL offer the Speed range `input#fps` with `min` FPS_MIN, `max` FPS_MAX, `step` 1 and initial value FPS_DEFAULT, the value text "{n} fps", the label "Speed" and the help "Drop to 4–6 fps if the receiver skips frames.", and the range SHALL be `disabled` in the Stream_Mode `step`. [unit]
9. THE Stream_View SHALL offer the radio group `name="size"` with values `s`, `m` (checked by default) and `l`, labelled "Small", "Medium" and "Large", with the help "Symbol size. Larger symbols read from farther away.", applying the Stylesheet classes `stage__code--s` and `stage__code--l` and no class for `m`. [Playwright]
10. THE Stream_View stage SHALL keep a white (#FFF) background and SHALL place nothing over the code. [Playwright]
11. WHILE the container width of `.page` is at most 760 px, THE Stream_View SHALL use the Stylesheet container query layout, and THE `page--m` root class SHALL be used only by the Harness_Build. [Playwright]
12. THE Stream_View playback engine, full-screen mode and reduced-motion behaviour SHALL meet Requirement 11. [Playwright]
13. THE Stream_View SHALL show the Photosensitivity_Notice above the stage in every Stream_Mode, with the board's markup (`div.wrap.noticebar` holding `div.callout.callout--warn` with `role="note"`): the title "Flashing content", the text "This view flashes. Use step mode if flashing is a problem for you.", the muted text "Step mode is the default when your system asks for reduced motion.", and in `div.callout__actions` the button "Switch to step mode" while the Stream_Mode is `play` or `paused` or the button "Back to playback" while it is `step`. The notice is the design's own copy and replaces the copy drafted before design export 2 (Resolved question 27). [Playwright]
14. THE Stream_View SHALL show the mode tag, its class, the transport label and the mode note of each Stream_Mode verbatim: `play`: tag "Playing" (`tag--cobalt`), note "Playing at {fps} fps. Pause to step by hand."; `paused`: tag "Paused" (`tag--signal`), note "Paused. Previous and Next step one packet."; `step`: tag "Step mode" (`tag--solid`), note "Step mode: the code changes only when you press Next or Previous."; and WHEN the user activates "Switch to step mode" THE Stream_View SHALL enter `step`, and WHEN the user activates "Back to playback" THE Stream_View SHALL enter `play`. [unit]
15. THE Stream_View SHALL offer `div.stepctl` with the buttons "Previous" and "Next" (each with its arrow icon), `disabled` in the Stream_Mode `play` and enabled in `paused` and `step`, where Next shows the Packet with the next sequence number and Previous shows the Packet with the previous sequence number, and Previous SHALL be `disabled` while the oldest of the STEP_HISTORY Packets held is shown. [Playwright]
16. THE Stream_View SHALL offer the link `a.btn.btn--block` "Full screen" (with the board's icon) in `div.stepctl`, and WHEN the user activates it THE Stream_View SHALL enter the Full_Screen_State converted from SendScreenFull.dc.html (Requirement 11, criterion 10). [Playwright]

### Requirement 4: Send on paper (route `/send/paper`)

**User Story:** As a sender who wants a durable copy, I want a print preview of the strip and a print button, so that a phone can read the file from paper now or years later, on A4 or Letter.

#### Acceptance Criteria

1. WHEN the route `/send/paper` is requested while a Sender_File is set, THE App SHALL render Paper_View converted from SendPaper.dc.html with the board's class names, structure, text and ARIA text: the back link `aria-label="Back to file and output"` (to `/send`), the heading "Print a strip", the tag "{name} · {size} KB", the setup panel (`aria-label="Print setup"`) and the paper preview inside `div.two.two--side`. [Playwright]
2. WHEN the route `/send/paper` is requested while no Sender_File is set, THE App SHALL navigate to `/send`. [Playwright]
3. THE Paper_View setup panel SHALL show the legend "Paper", the radio group `name="paper"` with the values `a4` (`id="paper-a4"`, checked by default) and `letter` (`id="paper-letter"`), labelled "A4" and "Letter", and the help "A4 is 210 × 297 mm, Letter is 8.5 × 11 in. The preview and the printed pages follow the choice." [Playwright]
4. THE Paper_View SHALL show the "Preview page" value "{p} / {N}" and the buttons `aria-label="Previous page"` and `aria-label="Next page"`, where the previous button is `disabled` on page 1 and the next button is `disabled` on page N. [Playwright]
5. THE Paper_View SHALL show the row "Codes" as "{T} · {PER_PAGE} per page · includes repair", the row "Session" as the Session_Short and the row "SHA-256" as the chip of Requirement 2, criterion 4 (the board shows "149 · 9 per page · includes repair", "7F3A" and "a1b2 c3d4 e5f6…"). [unit]
6. THE Paper_View SHALL show the primary button "Print {N} pages" ("Print 1 page" when N is 1; derived singular) and the callout "Print at 100%" with the board's text. [unit]
7. THE Paper_View preview SHALL be an `article.paper` with `aria-label="Page {p} of {N} preview"`, four registration marks, the header, the grid of tiles and the footer, where each tile is a `figure.tile` holding the Symbol_Component with the `aria-label` equal to the caption label, the caption label "P{p}·{ii}" ({ii} the 2-digit position on the page) and the caption "{g}/{T}" ({g} the 1-based index of the Packet in `page()` order). [Playwright]
8. THE Paper_View header SHALL show the file name (`.paper__name`), the meta line "{n} KB · SHA-256 {12 hex digits}… · {T} symbols" (the board shows "184 KB · SHA-256 a1b2c3d4e5f6… · 149 symbols"), and in `.paper__id` the page text "Page {p} of {N}" (`.paper__page`) and "Session {S}" (`.paper__meta`) with {S} the Session_Short (Requirement 10, criterion 6). [Playwright]
9. THE Paper_View footer SHALL show "STRIP · PRINT AT 100% · BLACK ON WHITE" and the ruler with the text "10 cm". [unit]
10. WHEN the user activates the print button, THE App SHALL call `window.print()` on the same window and SHALL show all N Print_Sheets to the printer (Requirement 10, criterion 8). [Playwright]
11. WHILE the container width of `.page` is at most 760 px, THE Paper_View SHALL use the Stylesheet container query layout, and THE `page--m` root class SHALL be used only by the Harness_Build. [Playwright]
12. THE Paper_View pipeline (page count, layout, print CSS, module size, Letter) SHALL meet Requirement 10. [Playwright]
13. THE Paper_View SHALL keep all N `article.paper` Print_Sheets in the document, inside `div.paper-wrap`, and SHALL hide every sheet except the previewed one on screen with the class `paper--off` and the screen-only rule of Requirement 19, criterion 8, so that print shows all N sheets without a script running at print time. [Playwright]
14. WHERE the radio `#paper-letter` is checked, THE Paper_View SHALL set no class and no attribute on the preview for Letter, because the Stylesheet rule `.two--side:has(#paper-letter:checked) .paper` selects Letter on screen and in print (Requirement 10, criterion 10); the SendPaperLetter board sets the class `paper--letter` on the sheet and the App does not, which is listed as a deviation in the task report and ignored by the DOM-parity normalizer. [Playwright]

### Requirement 5: Receive screen (route `/receive`)

**User Story:** As a receiver, I want to point my phone at a strip or a screen, or add photos of printed pages, and watch the file rebuild, so that I get the file only when its hash matches.

#### Acceptance Criteria

1. WHEN the route `/receive` is requested, THE App SHALL render Receive_View: the page nav and the `section.strip.rx` converted from ReceiveState.dc.html (back link `aria-label="Back to home"`, heading "Receive", viewfinder `.vf`, `.capture`, Photo_List, status `role="status"`, ring, stats `aria-live="polite"`, dock), with the board's class names, structure, text and ARIA text, in the initial Receive_Phase `empty`. [Playwright]
2. THE Receive_View SHALL show, for each of the 10 Receive_Phases, the tag, tag class, heading, message, primary button text and class, secondary button text, HUD text, viewfinder class and note, camera state tag, photo hint, banner and ring state listed in Appendix D, verbatim, with the board's instance numbers replaced by computed values. [unit]
3. WHEN the user activates "Start camera" in the phase `empty`, THE App SHALL call `getUserMedia` (and SHALL NOT call it on page load) and SHALL enter `ask` while the request is pending; on success THE App SHALL enter `scan`, on a permission refusal THE App SHALL enter `denied`, and on NotFoundError, NotReadableError, OverconstrainedError or AbortError THE App SHALL enter `nocam`. WHEN the user activates "Allow camera" in `ask` while no request is pending, THE App SHALL request the camera again (Appendix C, row C35). [Playwright]
4. WHILE the Receive_Phase is `denied`, THE Receive_View SHALL show the three steps "Open the site settings from the address bar.", "Set Camera to Allow." and "Return here and tap Try again.", and "Try again" SHALL request the camera again. [Playwright]
5. WHILE the Receive_Phase is `scan`, `repeat` or `dup`, THE Receive_View SHALL show the torch button `aria-label="Torch"` only when the camera track reports the `torch` capability. [Playwright]
6. WHEN the Scan_Session counts a packet ignored with reason SESSION_MISMATCH while the Receive_Phase is `scan` or `repeat` and the packet came from the camera, THE App SHALL enter `dup`, showing the HUD "Session {A} ≠ {B}" ({A} the foreign Session_Short, {B} the current one) and the message "Still solving the first file. {n} packets from another session were skipped." with {n} the count of skipped packets ("1 packet from another session was skipped." for 1; derived singular). [Playwright]
7. WHEN the user activates "Keep current file" in `dup`, THE App SHALL return to `scan` and SHALL NOT re-enter `dup` for the same foreign session, and WHEN the user activates "Switch to new", THE App SHALL create a new Scan_Session and return to `scan`. [Playwright]
8. WHEN the Decoder reports `complete`, THE App SHALL read `result()`, enter `done`, show the file name, the size and "SHA-256 match · {12 hex digits in 3 groups of 4}…" in the viewfinder, and make "Download" download the file (Requirement 12, criterion 9). [Playwright]
9. IF the Decoder returns `rejected` with HASH_MISMATCH while the Receive_Phase is `verify` or a camera phase, THEN THE App SHALL enter `failed`, SHALL NOT offer any download, SHALL keep no payload bytes, and SHALL show in the `callout--error` banner the title "Hash mismatch" and the text "Expected {e}, got {a}", where {e} and {a} are `hashes.expected` and `hashes.actual` of the rejected status (12 lowercase hexadecimal digits each, ungrouped, as the board; dependency D1, done). [Playwright]
10. WHEN the user activates a Receive_Phase button, THE App SHALL perform the action and the transition listed for it in Appendix D, creating a new Scan_Session wherever Appendix D says "new session" (the codec Decoder is terminal after a rejection). [unit]
11. WHEN the user activates "Stop scanning" in `scan` or `repeat`, THE App SHALL stop every camera track and return to `empty`. [Playwright]
12. THE Receive_View SHALL contain the Image_Intake exactly as the board has it: `div.capture` with the tag "Camera: {state}", `label.btn.picker` "Add photo of a page" holding `input.sr-only[type="file"][accept="image/*"]` without the `multiple` attribute, and the help "One photo at a time. Add as many pages as you have." [Playwright]
13. IF the stall condition of Requirement 12, criterion 12 occurs, THEN THE Receive_View SHALL show the Error_Panel kind `stall`, and IF the nothing-readable condition of Requirement 12, criterion 12 occurs, THEN THE Receive_View SHALL show the Error_Panel kind `nothing` (Requirement 7). [Playwright]
14. THE Receive_View in the Harness_Build SHALL be reachable for each of the 10 Receive_Phases through the gallery route of Resolved question 21, rendering ReceiveStates.dc.html's 10 cells with the board's instance values supplied as fixture props. [Playwright]
15. WHILE the viewport is 390 px wide, THE Receive_View SHALL use the Stylesheet `rx` container layout, and WHILE the `rx` container is at least 880 px wide, THE Receive_View SHALL use the two-column layout `@container rx (min-width: 880px)`, and WHILE the `rx` container is at most 520 px wide THE `.capture` row SHALL use the single-column layout of the Stylesheet. [Playwright]
16. THE Receive_View SHALL show the Photo_List header "Added photos" with the count tag "None" when no photo is added and "{n} photos · {m} symbols" otherwise ("1 photo · {m} symbols" for 1 and "{m} symbol" for 1; derived singular), where {m} is the sum of the "found" counts of the rows; each row SHALL show the file name (`.photo__name`), "{found} symbols found" ("1 symbol found" for 1), the thumbnail `span.thumb` of the board and the button `aria-label="Remove {name}"`; and WHILE no photo is added THE Photo_List SHALL show the photo hint of the current Receive_Phase (Appendix D). [Playwright]
17. WHILE `progress().totalBlocks` is greater than 0, THE Receive_View SHALL show the meter `div.meter` with `progress.progress--cobalt` (`value` min(distinct, K), `max` K, label "Distinct packets seen") and the ends "Distinct packets" and "{min(distinct, K)} of {K}", where distinct is `progress().distinctPackets` and K is `progress().totalBlocks` (the board shows "41 of 111"; in the phases where the board has no meter the meter carries the attribute `data-addition`, so photos added in `empty` show it too). [unit]
18. WHILE the Receive_Phase is `nocam`, THE Receive_View SHALL show in the dock `label.btn.btn--primary.btn--lg.btn--block.picker` "Add photo of a page" in place of the primary button, and the secondary button "Back". [Playwright]
19. THE Receive_View SHALL show an Error_Panel in place of the `section.strip.rx` (inside `main`, with the page nav kept) for each Error_Panel disposition of Requirement 13, and SHALL return to the Receive_Phase named by the panel action (Appendix F). [Playwright]

### Requirement 6: About screen (route `/about`)

**User Story:** As a cautious user, I want to read what Strip does with my file and what it does not do, so that I can trust it with a document.

#### Acceptance Criteria

1. WHEN the route `/about` is requested, THE App SHALL render About_View converted from About.dc.html with the board's class names, structure, text and ARIA text, with `aria-current="page"` on the About nav link. [Playwright]
2. THE About_View SHALL contain, verbatim: the heading "Nothing leaves this device.", the sections `#privacy`, `#account`, `#caveat` ("Strip does not encrypt"), `#limits` and `#credits`, and the table of contents `nav[aria-label="On this page"]` linking to those five ids. [Playwright]
3. THE About_View "Max file size" row SHALL show FILE_CAP_BYTES divided by 1024 followed by " KB", and every other Limits row SHALL keep the board text, including the static row "Example" with the text "A 184 KB file is 111 source packets, 149 symbols and 17 printed pages (9 per page, 3 × 3)." [unit]
4. WHEN a user opens `/about#limits`, THE App SHALL scroll the `#limits` section into view. [Playwright]
5. THE About_View SHALL link "GitHub" (credits button and footer) to REPO_URL with `rel="noopener"`, "Third-party notices" (credits row and footer) to `/THIRD_PARTY_NOTICES`, "Home" in the footer to `/`, and "Send a file" to `/send`. [unit]
6. THE statements "No upload, no server copy, no share link" and "Once the page has loaded, Strip does not need a connection to send or receive" SHALL be true of the shipped App, proved by Requirement 16, criteria 1 and 2 and Requirement 14, criterion 5. [Playwright]
7. THE link "Third-party notices" SHALL open THIRD_PARTY_NOTICES as text in the browser (Requirement 15, criterion 11), and the About_View and Home_View links SHALL satisfy symbols Requirement 15, criterion 5. [Playwright]
8. WHILE the container width of `.page` is at most 760 px, THE About_View SHALL use the Stylesheet container query layout, and THE `page--m` root class SHALL be used only by the Harness_Build. [Playwright]

### Requirement 7: Error states (Error_Panel and the Errors boards)

**User Story:** As a user who hits a limit or a failure, I want the app to say what happened, show the numbers and offer one next step, so that I am never shown a raw error code.

#### Acceptance Criteria

1. THE App SHALL implement Error_Panel from ErrorState.dc.html as an inline component (`section.strip.err`, `role="alert"`) with the prop `kind` of `size`, `empty`, `imgread`, `imgbig`, `imgmany`, `nocode`, `denied`, `nocamera`, `nothing`, `otherfile`, `hash`, `internal`, `camera` or `stall`, and SHALL NOT give it a route in the production bundle. [unit]
2. FOR EACH of the 14 kinds, THE Error_Panel SHALL show the icon, tag, title, message, rows, tips, primary action and secondary action listed verbatim in Appendix F, where the parts in braces are templates filled with computed values and with the constants FILE_CAP_BYTES, IMAGE_MAX_FILE_BYTES, IMAGE_MAX_COUNT, STALL_TIMEOUT_MS and NOTHING_TIMEOUT_MS, and the board's instance values (for example "28 MB", "20 MB", "24 / 24", "1.4 MB", "82 / 111") SHALL appear only as test fixtures. [unit]
3. WHERE kind is `size`, THE Error_Panel SHALL show the tag "File too large", the title "This file is too big for Strip", the message "{name} is {size}. Strip carries files up to {cap} KB. Compress it, or split it into smaller files.", the rows "File", "Size" and "Limit", a `progress.progress--signal` (`value` 100, `max` 100, label "File size is over the limit"), the meter ends "{cap} KB limit" and "{size} file", and the actions "Choose another file" (to `/send`) and "About limits" (to `/about#limits`). [unit]
4. WHERE kind is `camera` (shown only when `navigator.mediaDevices` or `getUserMedia` is absent, never for a missing camera device), THE Error_Panel SHALL show the rows "Camera API" ("Missing" or "Present"), "Secure context" ("Yes (HTTPS)" or "No") and "Send" ("Available"), and the actions "Open Send" (to `/send`) and "Copy page link" (copies the page URL to the clipboard). [Playwright]
5. WHERE kind is `stall`, THE Error_Panel SHALL show the title "No progress for {STALL_TIMEOUT_MS / 1000} seconds", the message "{solved} of {total} blocks are solved. The remaining blocks need packets the camera has not read cleanly yet.", the small ring (`ring ring--sm ring--dim`, `aria-label` "{pct} percent solved") with the computed percent, the text "Frozen at {solved} / {total}", the rows "Blocks solved" ("{solved} / {total}"), "Packets seen" (Packets_Seen) and "Last new block" ("{s} s ago"), the three tips of ErrorState.dc.html, and the actions "Keep scanning" and "Start over". [unit]
6. THE Error_Panel SHALL compute the ring arc `d` from the percent with the same pure function as the Receive ring (`M50 6A44 44 0 …`), with percent 100 drawn as the full-circle path of ReceiveState.dc.html. [property]
7. WHEN the user activates "Keep scanning" in the `stall` or `nothing` panel, THE App SHALL return to `scan` with the Scan_Session unchanged and both timers of Requirement 12, criterion 12 restarted, and WHEN the user activates "Start over" in the `stall` or `otherfile` panel, THE App SHALL create a new Scan_Session and return to `scan` (or to `empty` when the camera is off). [Playwright]
8. THE App SHALL show an Error_Panel, a Send_State, a Receive_Phase or the Receive_View banner for each error disposition of Requirement 13 and SHALL NOT show any raw error code string. [Playwright]
9. WHERE the Errors boards are rendered by the Harness_Build gallery route, THE Harness_Build SHALL render the three kinds of Errors.dc.html (`size`, `camera`, `stall`) and the 14 kinds of ErrorsAll.dc.html with the board's instance values (Resolved question 21). [Playwright]
10. THE Error_Panel SHALL choose its icon as the board does: the file icon for `size`, `empty`, `imgread` and `imgbig`; the camera icon for `camera`, `denied` and `nocamera`; the clock icon for `stall` and `nothing`; the alert icon for the other kinds. [unit]
11. THE App SHALL render a kind that has no rows (`denied`, `nocamera`, `internal`) with an empty `dl.kv` exactly as ErrorState.dc.html does, and SHALL render the `size` meter, the `stall` ring and the `stall` tips only for those kinds. [unit]
12. THE Error_Panel actions SHALL keep the board's `a.btn` elements and class names with the board's `href` (Appendix F), and WHERE an action is not a navigation (Reload, Copy page link, Keep scanning, Start over, Try again, Keep current file, Discard, Scan again) THE App SHALL perform it in a click handler that calls `preventDefault`; each such action is listed as a deviation in the task report; the "About limits" action keeps the App href `/about#limits` while the board's `href` is `About.dc.html`, so the DOM-parity allowlist has an entry for it and the task report has a deviation line. [unit]
13. WHERE kind is `hash`, THE Error_Panel SHALL show the rows "Expected" and "Got" with `hashes.expected` and `hashes.actual` of the rejected status (12 lowercase hexadecimal digits, ungrouped), and WHERE kind is `otherfile`, THE Error_Panel SHALL show the rows "Current session" and "Other session" as Session_Short values. [unit]
14. WHERE kind is `imgmany`, THE Error_Panel SHALL show the row "Photos" as "{count} / {IMAGE_MAX_COUNT}" and the row "Pages needed" as `ceil(T / PER_PAGE)` for the stream being received, with T = K + `pageRepairCount(K)` computed without encoding (the board shows "24 / 24" and "17"; Resolved question 33). [unit]
15. WHERE kind is `nothing`, THE Error_Panel SHALL show the row "Last symbol" as "{s} s ago" ({s} the whole seconds since the last `found` outcome, or since the camera started when none occurred) and the row "Distance" as "Aim for 30–50 cm". [unit]
16. THE Fidelity_Gate SHALL cover the Errors and ErrorsAll boards at 1280 px (desktop) and 390 px (mobile) and each Error_Panel kind at 420 px (Requirement 20, criterion 1), using the Stylesheet rules for `.err` and `.errgrid`. [Playwright]

### Requirement 8: App shell, routing and navigation

**User Story:** As a user, I want every screen at a stable URL with the same navigation, so that I can bookmark, go back and share the page link.

#### Acceptance Criteria

1. THE App SHALL serve the routes of Appendix A from one `index.html` as a single-page app, with client-side navigation that does not reload the page. [Playwright]
2. WHEN a path that is not in Appendix A is requested, THE App SHALL navigate to `/` (Resolved question 21). [Playwright]
3. THE App SHALL render the brand link (`aria-label="Strip home"`, to `/`) and the primary navigation (`aria-label="Primary"`) with the links "Send" (`/send`), "Receive" (`/receive`) and "About" (`/about`) on every screen, as in the boards. [Playwright]
4. WHILE the current route is `/send`, `/send/screen` or `/send/paper`, THE App SHALL set `aria-current="page"` on the "Send" link, WHILE the current route is `/receive`, on "Receive", and WHILE the current route is `/about`, on "About", and no other nav link SHALL carry it. [Playwright]
5. THE App SHALL translate every board link `href="X.dc.html"` to the Route or the in-view state of Appendix A (`SendScreenFull.dc.html` and `SendScreen.dc.html` in the full-screen link and "Exit full screen" are states of `/send/screen`), so that no built page contains the string `.dc.html`. [unit]
6. THE App SHALL keep the Sender_File, the Scan_Session and every control value in memory only, so that a full page reload returns to the initial state of the Route (for `/send/screen` and `/send/paper` without a Sender_File, to `/send`). [Playwright]
7. THE App SHALL set `<html lang="en">`, a `viewport` meta tag with `width=device-width, initial-scale=1`, and a `document.title` per Route taken from the `<title>` of the desktop board, except that Receive is titled "Receive" (Resolved question 15; Appendix A lists the titles). [unit]
8. WHEN the user navigates to a hash link such as `/about#limits`, THE App SHALL scroll to the target element. [Playwright]

### Requirement 9: Limits and file intake

**User Story:** As a user, I want clear limits that are enforced before work starts, so that I never wait on a file that cannot be sent or received.

#### Acceptance Criteria

1. THE App SHALL define FILE_CAP_BYTES in one source file and SHALL use that constant in Send_View, About_View, Error_Panel and the receiver decoder limits, so that changing the value changes every use. [unit]
2. THE App SHALL compare the size of a chosen file with FILE_CAP_BYTES before reading its bytes, and SHALL enter the Send_State `toolarge` when the size is greater. [unit]
3. THE App SHALL create the receiver Decoder with `maxPayloadBytes` equal to FILE_CAP_BYTES + 422, where 422 is the longest Metadata_Record (1 + 2 + 255 + 1 + 127 + 4 + 32 bytes), so that a stream above the cap is refused with PAYLOAD_TOO_LARGE. [unit]
4. THE App SHALL create each Encoder with `packetSize: 1732` and the codec default limits, and SHALL map a thrown PAYLOAD_TOO_LARGE or TOO_MANY_BLOCKS to the Error_Panel kind `size` of Requirement 13. [unit]
5. FOR ALL Sender_Files of 1 to FILE_CAP_BYTES bytes, THE App SHALL produce an Encoder whose `page()` Packets, pushed to a codec Decoder, complete with a payload, name and MIME identical to the input; a Sender_File of 0 bytes is not encoded (Requirement 2, criterion 16). [property]
6. THE test suite SHALL pin K and T for a deterministic payload with the name "field-notes-2026.pdf" and MIME "application/pdf" at 16, 32, 64, 128, 184 and 256 KB to the values measured with the committed overhead table: K = 10, 20, 39, 78, 111, 155 and T = 24, 41, 67, 112, 149, 200 (a Metadata_Record of 75 bytes, blockSize 1702). [unit]
7. IF the Sender_File name makes the codec reject the Metadata with BAD_METADATA (empty, longer than 255 UTF-8 bytes, containing `/`, `\`, NUL or a control character, or equal to `.` or `..`), THEN THE App SHALL show the disposition of Requirement 13 for BAD_METADATA (the Error_Panel kind `internal`; Resolved question 35) and SHALL NOT alter the name. [property]
8. WHILE the output `paper` is selected on Send_View, IF the Sender_File size exceeds PAPER_WARN_BYTES, THEN THE Send_View SHALL show the paper warning as a `callout callout--warn` with the title "Many pages" and the text "This file needs {N} printed pages ({T} codes). A smaller file needs fewer pages. You can also show it on screen instead." (derived copy; {N} and {T} computed; at the threshold, T = 67 and N = 8), carrying the attribute `data-addition`. The warning is not in the design (Appendix C, row C29). [unit]
9. THE Image_Intake SHALL take one image at a time, and IF an image file is larger than IMAGE_MAX_FILE_BYTES, THEN THE App SHALL refuse the image before decoding it and SHALL show the Error_Panel kind `imgbig` with {limit} = IMAGE_MAX_FILE_BYTES formatted as "20 MB"; and IF IMAGE_MAX_COUNT images are already in the Photo_List, THEN THE App SHALL refuse the image before decoding it and SHALL show the Error_Panel kind `imgmany`. [unit]
10. THE App SHALL accept exactly one Sender_File per transfer and SHALL state this in the drop hint "one file" and in the About limits row "One. Zip several files first." [unit]
11. WHEN Paper_View is shown for a Sender_File above PAPER_WARN_BYTES, THE Paper_View SHALL show the paper warning of criterion 8 above the preview, with the attribute `data-addition`. [unit]
12. WHEN an accepted image has a long side above IMAGE_LONG_SIDE pixels, THE Image_Intake SHALL scale it, keeping the aspect ratio, so that the long side is IMAGE_LONG_SIDE (4096) pixels before decoding, so that the Decode_Worker receives an image of at most 4096 pixels per side. [unit]
13. THE Image_Intake SHALL show each outcome that adds nothing as the Error_Panel kind named in Appendix E (derived from the board's own kinds, with no extra copy): `imgread` when the browser cannot decode the file as an image, `imgbig` and `imgmany` as in criterion 9, and `nocode` when no Packet was obtained from the image (outcome `not_found`, `found_many` with no valid Packet, or only BAD_CRC and BAD_HEADER Packets). [unit]
14. THE App SHALL show the image-limit values in the kinds `imgbig` and `imgmany` from IMAGE_MAX_FILE_BYTES and IMAGE_MAX_COUNT so that changing the constants changes the text; the board templates "20 MB" and "n / 24" equal the constants today (Appendix C, row C36). [unit]

### Requirement 10: Paper pipeline

**User Story:** As a sender, I want the printed pages to carry the whole file with repair codes at a size a phone can read, so that the strip survives a smudge or a lost corner.

#### Acceptance Criteria

1. THE App SHALL build the paper set from `encode(payload, { packetSize: 1732 })` and `encoder.page()` with the default repair count R(K) and no override, giving T = K + R(K) Packets in ascending sequence order. [unit]
2. THE App SHALL convert each Packet with `encodeSymbol(packet, { version: 30, ecc: "L" })` (the `QR_DEFAULTS.print` cell) and FOR ALL Packets of an Encoder at packetSize 1732, THE symbol SHALL be version 30 with a 145-module width including the 4-module Quiet_Zone, and THE tile SHALL be drawn by the Symbol_Component (Requirement 19, criterion 12). [property]
3. THE App SHALL use the Quiet_Zone default of 4 modules and SHALL NOT use `allowShortQuietZone` (the Symbol board's viewBox 145 is 137 modules plus the 4-module quiet zone on each side, so the board and the codec agree; Appendix C, row C4). [unit]
4. THE App SHALL split the T Packets into N = ceil(T / PER_PAGE) pages, with page p holding the Packets with sequence numbers (p − 1) × PER_PAGE to min(p × PER_PAGE, T) − 1 in order, so that every Packet appears on exactly one page and the last page may be partly filled. [property]
5. THE App SHALL label the tile at position i (1-based) on page p "P{p}·{ii}" with {ii} the 2-digit number, and the caption "{g}/{T}" with g = (p − 1) × PER_PAGE + i. [property]
6. THE App SHALL print on each Print_Sheet the human-readable header of SendPaper.dc.html: the file name, the meta line, "Page {p} of {N}" and "Session {S}", where {S} is the Session_Short, the first 4 uppercase hexadecimal digits of the Session_Id (the header is in the design; Resolved question 19). [Playwright]
7. THE Stylesheet print rules SHALL apply: named pages `@page a4` and `@page letter` with `margin: 0`, `.no-print`, `.nav`, `.footer`, `.pagehead` and `.two--side > aside` hidden, each `.paper` with `break-after: page` and `break-inside: avoid` (the last `.paper` with `break-after: auto`), `.paper` 210 mm by 297 mm on A4, and ink `#000` on paper `#FFF` with `print-color-adjust: exact`; the App SHALL add no print rule. [Playwright]
8. WHEN the user prints, THE App SHALL have all N Print_Sheets in the document (Requirement 4, criterion 13), so that the generated PDF (Playwright `page.pdf()` with print media and `preferCSSPageSize`) has exactly N pages, the header of page p contains "Page {p} of {N}", and no screen chrome (nav, pagehead, setup panel) appears on any page. [Playwright]
9. WHEN printed on A4 at 100% scale with the board grid, THE width of one code SHALL be at least 145 × 0.339 mm = 49.2 mm (4 printer dots per module at 300 dpi; Resolved question 38), measured on the layout in print emulation, and THE test SHALL report the printed module size in mm (the board grid gives about 58.8 mm per code, 0.405 mm per module). [Playwright]
10. WHERE the radio `#paper-letter` is checked, THE print SHALL use Letter paper through the Stylesheet only (the named page `letter`, `.paper` 215.9 mm by 279.4 mm), so that the generated PDF page size is 215.9 mm by 279.4 mm with no tile clipped or overflowing the sheet, and WHERE `#paper-a4` is checked the PDF page size SHALL be 210 mm by 297 mm; THE App SHALL insert no rule through `CSSStyleSheet.insertRule` and SHALL set no `style` attribute, with zero `securitypolicyviolation` events (the CSSOM mechanism of the earlier Resolved question 14 is superseded). [Playwright]
11. THE App SHALL print through `window.print()` only, opening no popup window (`window.open` is never called) and no frame, and SHALL produce no `securitypolicyviolation` event. [Playwright]
12. FOR ALL paper sets, pushing the T Packets of the tiles in any order into a codec Decoder SHALL complete with bytes identical to the Sender_File. [property]
13. THE ruler `.ruler__bar` SHALL measure 100 mm ± 1 mm on an A4 Print_Sheet (47.6% of the sheet width), matching the text "10 cm". [Playwright]

### Requirement 11: Screen pipeline

**User Story:** As a sender, I want a smooth, controllable code stream that respects reduced-motion settings, so that a phone can read it and nobody is harmed by it.

#### Acceptance Criteria

1. WHEN Stream_View mounts, THE Stream_Player SHALL create a new Encoder with `packetSize: 1732`, SHALL call `next()` once per tick, and SHALL show the Packets with sequence numbers 0, 1, 2, … in order. [unit]
2. THE Stream_Player SHALL convert each Packet with `encodeSymbol(packet, { version: 30, ecc: "L" })` and SHALL draw it with the Symbol_Component. [unit]
3. THE Stream_Player SHALL schedule ticks every 1000 / fps milliseconds through the `apps/strip/src/clock` module, so that no other App module reads time, and a fake clock SHALL drive the unit tests. [unit]
4. WHEN the Speed value changes, THE Stream_Player SHALL apply the new interval from the next tick without restarting the sequence. [unit]
5. FOR ALL sequences of play, pause, Step_Mode, Next, Previous and speed-change actions, THE Packets produced by `next()` SHALL be the sequence numbers 0, 1, 2, … with none skipped and none repeated, THE shown sequence number SHALL equal the number predicted by a model (a tick or Next shows the following number, Previous shows the preceding number while it is held in the STEP_HISTORY Packets), and THE shown Packet bytes SHALL equal the Packet first produced for that number. [property]
6. FOR ALL speeds from FPS_MIN to FPS_MAX and a fake-clock run of 10 s in the Stream_Mode `play`, THE number of Packets shown SHALL be 10 × fps ± 1. [property]
7. WHILE the Stream_Mode is `paused` or `step`, THE Stream_Player SHALL NOT call `next()` on a timer and SHALL keep the current code on the stage. [unit]
8. WHERE `prefers-reduced-motion: reduce` matches when Stream_View mounts, THE Stream_View SHALL start in the Stream_Mode `step` on Packet 1 and SHALL NOT auto-play (the design states the same default in the Photosensitivity_Notice), THE controls Previous and Next (in the design) SHALL show exactly the previous and the next Packet per activation, and the user MAY choose "Play" or "Back to playback" to start the timer (Resolved question 27). [Playwright]
9. THE reduced-motion behaviour SHALL be in the App logic, because the Stylesheet comment states that code playback "keeps its frame rate" under `prefers-reduced-motion`, while the chrome animations are turned off by the Stylesheet. [Playwright]
10. WHEN the user activates the link "Full screen", THE Stream_View SHALL enter the Full_Screen_State converted from SendScreenFull.dc.html (`div.strip.fs` with `a.btn.fs__exit` "Exit full screen", `div.fs__code` holding the Symbol_Component with the current `aria-label`, and `p.fs__meta.t-label` "Packet {n} of {K} + repair · Lap {L} · {fps} fps"), and WHERE the Fullscreen API is available THE Stream_View SHALL also request browser full screen on the `.fs` element, whose size the user agent then sets; WHEN the user activates "Exit full screen" or the browser leaves full screen, THE Stream_View SHALL return to the normal state with the same Packet and Stream_Mode. [Playwright]
11. WHILE the Full_Screen_State is shown, THE `.fs` field SHALL keep a #FFF background, nothing SHALL overlap the code, THE Stream_Player SHALL keep the Stream_Mode it had, and the Space key SHALL keep toggling play and pause (the board has no other transport control). [Playwright]
12. WHEN the document becomes hidden, THE Stream_Player SHALL enter the Stream_Mode `paused`. [Playwright]
13. WHEN the user leaves Stream_View, THE Stream_Player SHALL stop its timer and release the Encoder. [unit]
14. WHEN the code size is changed, THE Stream_View SHALL change only the stage class and SHALL NOT re-encode. [unit]
15. WHEN the stage is rasterized by Playwright at device pixel ratio 2 for Medium and Large and at 1 for Large, THE decoder `decodeFrame` SHALL return the exact Packet, and THE test SHALL report the result for Small at both ratios and Medium at ratio 1 without a pass bar (3.86 CSS pixels per module for Medium, 2.62 for Small; Resolved question 13). [measured]
16. THE median work of one tick (`next()`, `encodeSymbol`, the path string and render) at version 30 SHALL be at most 33 ms (half of 1000 / FPS_MAX; Resolved question 38), measured by the Perf_Method of the symbols spec and reported. [perf]
17. THE Stream_Player lap SHALL be T Packets (the Lap tag of Requirement 3, criterion 4), THE stream SHALL continue after T with further Packets from `next()`, and THE counter SHALL continue past K ("Packet 130 of 111 + repair") while the progress bar stays at K (Resolved questions 27 and 39; the Send choice line shows the same lap, T / FPS_DEFAULT seconds, Appendix C, row C30). [unit]
18. THE Stream_Player SHALL keep the most recent STEP_HISTORY Packets in memory, SHALL answer Previous from that history, and SHALL release the history with the Encoder (Requirement 3, criterion 15). [unit]

### Requirement 12: Receiver pipeline

**User Story:** As a receiver, I want live camera scanning and photo input to feed one decoder, so that I can rebuild the file from a screen, a printed strip or photos of its pages.

#### Acceptance Criteria

1. WHEN camera access is granted, THE Frame_Loop SHALL request video with `facingMode: "environment"`, ideal width 1920, ideal height 1080 and no audio. [unit]
2. THE Frame_Loop SHALL capture each video frame as a bitmap scaled down (never up) to fit 1920 × 1080 and SHALL send the bitmap to the Decode_Worker, created with `maxWidth` 1920, `maxHeight` 1080 and mode `video`, so that no frame exceeds the Frame_Decoder maximum. [unit]
3. THE Frame_Loop SHALL submit a frame only while the Decode_Worker is idle, SHALL drop every other frame without a copy, and SHALL hold no pending frame. [unit]
4. WHILE the Frame_Loop runs in Chromium, THE App SHALL produce no main-thread task longer than 50 ms attributable to decoding. [Playwright]
5. WHEN the decode outcome is `found` or `found_many`, THE App SHALL push each Packet's bytes to the Scan_Session Decoder in order and SHALL wait for the returned status before pushing the next Packet. [unit]
6. WHEN the outcome is `not_found`, `not_strip_packet` or `dropped`, THE App SHALL take no user-visible action from the camera (for an image, criterion 13 applies), and WHEN a push returns `rejected` with BAD_CRC or BAD_HEADER, THE App SHALL count the Packet for the `#diag` readout and take no user-visible action. [unit]
7. THE App SHALL show "Packets seen" as Packets_Seen (the number of pushes with status `accepted` or `ignored`), "Blocks solved" as `solvedBlocks` followed by " / {totalBlocks}", the "Distinct packets" meter as `progress().distinctPackets` (Requirement 5, criterion 17), and the ring percent as `floor(100 × solvedBlocks / totalBlocks)` (0 while totalBlocks is 0) and 100 only when `complete` is true (Appendix C, rows C6 and C38). [property]
8. FOR ALL sequences of Packets, THE displayed Packets seen, blocks solved, distinct packets and percent SHALL never decrease within one Scan_Session, except through the rebuild of criterion 24. [property]
9. WHEN the Receive_Phase is `done` and the user activates "Download", THE App SHALL create a Blob of the Decoder payload with the MIME type of the Metadata, start a download with an anchor `download` attribute equal to the Metadata name, revoke the object URL afterwards, and the downloaded bytes SHALL equal the sent bytes, with zero `securitypolicyviolation` events. [Playwright]
10. THE App SHALL accept image files through the Image_Intake (`input type="file"`, `accept="image/*"`, without `multiple`, labelled and keyboard operable), SHALL decode one image at a time through `createImageBitmap` and the Decode_Worker `bitmap` message in `photo` mode with a maximum frame size of 4096 × 4096 (the Image_Intake limit of Requirement 9, criterion 12), and SHALL push every Packet found into the same Scan_Session, so that images added later add to the progress of earlier ones. [Playwright]
11. WHEN an image is a photo or a scan of a printed page with several symbols, THE Image_Intake SHALL request `maxSymbols` equal to PER_PAGE (Multi_Symbol_Read, dependency D2) and SHALL push every Packet found into the Scan_Session, so that one image of a page with all {PER_PAGE} symbols adds all {PER_PAGE} Packets. [Playwright]
12. WHILE the camera is on and the Receive_Phase is `scan`, `repeat` or `dup`, THE App SHALL apply two separate timers read from the `clock` module: IF at least one Packet has been accepted and `solvedBlocks` does not increase for STALL_TIMEOUT_MS (20 s), THEN THE App SHALL show the Error_Panel kind `stall`; and IF no `found` or `found_many` outcome has occurred for NOTHING_TIMEOUT_MS (30 s) since the camera started or since the last such outcome, THEN THE App SHALL show the Error_Panel kind `nothing`. The `stall` timer starts at the first accepted Packet (Resolved question 28), and when both conditions hold THE App SHALL show `stall`. [unit]
13. WHEN the user activates the torch button, THE App SHALL apply the `torch` constraint to the video track and SHALL show the button only when `getCapabilities().torch` is true. [Playwright]
14. WHEN the Receive_Phase becomes `verify`, `done`, `failed`, `empty` or `nocam`, or the user leaves the route, or activates "Stop scanning", THE App SHALL stop every camera track. [Playwright]
15. WHEN the document becomes hidden, THE Frame_Loop SHALL stop submitting frames and SHALL resume when the document becomes visible. [Playwright]
16. THE App SHALL NOT record, store or send video or frames, and the source SHALL contain no `MediaRecorder`, `ImageCapture` or frame-persisting call. [unit]
17. THE App SHALL create the Decode_Worker with `new Worker(new URL(…), { type: "module" })` from a same-origin file and SHALL pass the wasm URL from `@strip/symbols/wasm-url`, with the wasm requested from the same origin and not before the first receive action (the first activation of "Start camera" or the first image added). [Playwright]
18. WHERE the URL contains the fragment `#diag`, THE Receive_View of the production bundle SHALL show per-frame outcome (`found`, `found_many`, `not_found`, `dropped`), decode time, frames offered, decoded and dropped, the count of BAD_CRC and BAD_HEADER Packets, and sustained decodes per second, as `docs/device-test.md` requires of the receiver page (the readout is not in the design; Resolved question 29). [Playwright]
19. WHEN a Packet is pushed and the status is `ignored` with reason SESSION_MISMATCH, THE App SHALL increment the skipped counter and SHALL read the foreign session id with `decodePacket(bytes).sessionId` for the HUD and the Error_Panel kind `otherfile`. [unit]
20. WHEN a Packet is pushed and the status is `ignored` with reason ALREADY_COMPLETE or DENSE_STORE_FULL, THE App SHALL increase Packets_Seen and SHALL leave the Receive_Phase unchanged, and WHEN the status is `ignored` with reason DUPLICATE_PACKET, THE App SHALL increase Packets_Seen and apply criterion 22. [unit]
21. WHILE the Frame_Loop sees a printed page with several symbols, THE Frame_Loop SHALL obtain every symbol in each submitted frame through `@strip/symbols` (Multi_Symbol_Read, dependency D2) and SHALL push every Packet found into the Scan_Session. [Playwright]
22. WHEN a Packet from the camera is pushed with status `ignored` and reason DUPLICATE_PACKET while the Receive_Phase is `scan`, THE App SHALL enter `repeat` with the HUD "Packet {n} already seen" ({n} the sequence number of the Packet plus 1), and THE App SHALL return to `scan` WHEN a Packet is accepted or WHEN REPEAT_HOLD_MS pass without a further DUPLICATE_PACKET status (derived rule; Appendix C, row C32). A duplicate from an image SHALL NOT enter `repeat`. [unit]
23. WHEN an image has been decoded, THE App SHALL add one row to the Photo_List with the file name and the count of Packets obtained from it ("found": every Packet of a `found` or `found_many` outcome that `decodePacket` accepts), and WHEN that count is 0, THE App SHALL add no row and SHALL show the Error_Panel kind `nocode`. [unit]
24. WHEN the user activates the remove button of a row of the Photo_List, THE App SHALL remove the row and its Packets, and SHALL rebuild the Scan_Session by pushing the retained Packets of every other source (the camera and the other rows; the retained set is the accepted Packets only, so duplicates and foreign Packets are not kept) in their original order into a new codec Decoder, so that the progress shows only the Packets of the sources that remain (derived rule; the Decoder cannot remove a Packet; Appendix C, row C40). [unit]
25. WHEN the Scan_Session counts a Packet of another session from an image, THE App SHALL show the Error_Panel kind `otherfile`, SHALL NOT enter `dup` (the phase `dup` is for the camera), SHALL add no Photo_List row for that image, and SHALL hold its Packets pending, so that "Start over" adopts them into the new Scan_Session and "Keep current file" drops them. [Playwright]

### Requirement 13: Error mapping

**User Story:** As a user, I want every failure explained in plain words with a next step, so that I am never shown an internal code.

#### Acceptance Criteria

1. THE App SHALL map every member of the codec ErrorCode union (10), the codec Ignore_Reason union (4), the SymbolErrorCode union (4), the DecodeOutcome kinds (5: `found`, `found_many`, `not_found`, `not_strip_packet`, `dropped`), the image failures and the camera and environment failures to exactly one disposition in Appendix E, as a total function checked against the exported `ERROR_CODES` and `SYMBOL_ERROR_CODES`. [property]
2. FOR ALL error inputs, THE rendered DOM text SHALL NOT contain any code string (for example `HASH_MISMATCH` or `PAYLOAD_TOO_LARGE`). [property]
3. WHERE Appendix E names a Send_State or a Receive_Phase, THE App SHALL show it with the verbatim copy of Requirement 2 or Appendix D. [Playwright]
4. WHERE Appendix E names an Error_Panel kind, THE App SHALL show that kind with the verbatim copy of Appendix F; THE App SHALL NOT show any of the earlier drafted kinds `format`, `filename`, `draw`, `reader`, `unexpected` or `limit`, and SHALL use the board text "No camera found" for the kind `nocamera` and the phase `nocam`. [unit]
5. WHEN the camera permission is refused (`NotAllowedError`, `SecurityError`), THE App SHALL enter the Receive_Phase `denied`, and WHEN `navigator.mediaDevices` or `getUserMedia` is absent, THE App SHALL show the Error_Panel kind `camera`, and WHEN `getUserMedia` fails with NotFoundError, NotReadableError, OverconstrainedError or AbortError, THE App SHALL enter the Receive_Phase `nocam` (text "No camera found" from the board). [Playwright]
6. IF the Decode_Worker cannot start or the wasm cannot load (UNSUPPORTED_ENVIRONMENT), THEN THE App SHALL show the Error_Panel kind `internal` and SHALL keep the sender screens usable. [Playwright]
7. THE App SHALL NOT call `result()` before `progress().complete` is true, so that INCOMPLETE_DECODE is never raised. [unit]
8. IF an exception that is neither a CodecError nor a SymbolError reaches the top of a view, THEN THE App SHALL show the Error_Panel kind `internal` and SHALL NOT show a stack trace. [unit]
9. THE App SHALL send no error report anywhere. [Playwright]
10. IF a codec or symbols code has no dedicated board kind (UNSUPPORTED_VERSION, BAD_METADATA, INVALID_INPUT, ENCODE_FAILED, PACKET_TOO_LARGE, UNSUPPORTED_ENVIRONMENT), THEN THE App SHALL show the Error_Panel kind `internal`, and no dedicated kinds are added (Resolved question 35). [unit]
11. THE App SHALL show the Receive_Phase or the Send_State for a condition that arises inside the mounted Receive_View or Send_View and the Error_Panel kind for the same condition when it arises from the Image_Intake with the camera off or from a code path outside that view (Appendix C, row C39; Resolved question 40). [Playwright]

### Requirement 14: PWA (manifest, service worker, offline, install)

**User Story:** As a user on a plane or a train, I want to install Strip and use it with no connection, so that I can send or receive a file anywhere.

#### Acceptance Criteria

1. THE App SHALL serve a web app manifest with `name` "Strip", `short_name` "Strip", `start_url` "/", `scope` "/", `display` "standalone", `background_color` and `theme_color` each equal to `#F7F5EF` (the Stylesheet `--paper-50`), and `icons` containing a 192 px PNG, a 512 px PNG and a 512 px maskable PNG, all same-origin, plus a 180 px PNG `apple-touch-icon` linked from index.html. [unit]
2. THE index.html SHALL link the manifest and set a `theme-color` meta tag equal to the manifest `theme_color`. [unit]
3. THE App SHALL register a service worker from `/sw.js` with scope `/` after the page has loaded, and the service worker SHALL be served as a same-origin file under the App_CSP. [Playwright]
4. THE service worker SHALL precache the app shell, every hashed script and stylesheet, the fonts, the reader `.wasm`, the manifest, the icons and THIRD_PARTY_NOTICES, with a precache list generated at build time and every entry same-origin. [unit]
5. WHEN the network is offline after the first load and service worker activation, THE App SHALL load each Route of Appendix A, run a send, and decode an image, with zero failed requests. [Playwright]
6. WHEN a navigation request for a Route of Appendix A is not in the cache or network, THE service worker SHALL answer with the cached `index.html`. [unit]
7. THE service worker SHALL make no request to another origin and SHALL cache only same-origin app assets. [Playwright]
8. THE App SHALL meet the installability criteria of Chromium (manifest fields above, 192 and 512 icons, registered service worker, HTTPS) and the install SHALL be checked on one Android phone and one iPhone (the iPhone uses the 180 px `apple-touch-icon`). [manual]
9. WHEN a new service worker version is installed, THE service worker SHALL stay in the `waiting` state and take over only when no window of the App remains open, SHALL NOT call `skipWaiting`, and the running page SHALL keep its assets for the whole session (Resolved question 25); the `activate` handler SHALL call `clients.claim()` so that the first visit is controlled, which cannot swap assets under a running page because the activation of an update waits for every window to close. [Playwright]

### Requirement 15: CSP and delivery headers

**User Story:** As the app owner, I want one strict policy delivered as HTTP headers on every response, so that the app cannot load or run anything it does not ship.

#### Acceptance Criteria

1. THE App SHALL deliver the App_CSP as the HTTP response header `Content-Security-Policy` with exactly this value: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` (equal to `STRIP_CSP`, which already contains `worker-src 'self'`; Resolved question 20; dependency D3, done). [unit]
2. THE App_CSP SHALL contain neither 'unsafe-eval' nor 'unsafe-inline' and SHALL leave `style-src`, `img-src`, `font-src`, `manifest-src` and `media-src` unset so that each falls back to 'self'. [unit]
3. THE `apps/strip/src/csp.ts` source SHALL keep exporting `STRIP_CSP` unchanged and SHALL export `APP_CSP` defined as `STRIP_CSP`, and a unit test SHALL assert that `APP_CSP` equals the literal of criterion 1 and equals `STRIP_CSP`. [unit]
4. THE App SHALL deliver the response header `Permissions-Policy: camera=(self)`. [unit]
5. THE repository SHALL contain `apps/strip/vercel.json` (the Vercel project Root Directory; not present when this spec was written; `outputDirectory` `dist/app`) whose `headers` entry for the source `/(.*)` sets `Content-Security-Policy` to the App_CSP and `Permissions-Policy` to `camera=(self)` on every route and asset, plus `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff` (Resolved question 20), and a unit test SHALL assert that each value equals the export of `csp.ts` character for character. [unit]
6. THE `vercel.json` SHALL serve `.wasm` files with `Content-Type: application/wasm` and SHALL rewrite the Routes of Appendix A to `/index.html`, leaving `/THIRD_PARTY_NOTICES` and every other static asset unrewritten. [unit]
7. THE Vite dev server, the Vite preview server and the e2e harness server SHALL send the same two headers from `csp.ts`, and a Playwright test SHALL assert that the page, the worker script, `sw.js`, the manifest and the `.wasm` responses each carry them. [Playwright]
8. WHEN every flow of Requirement 21 runs under the App_CSP, THE test SHALL observe zero `securitypolicyviolation` events and zero console errors, covering the worker, the service worker, print (A4 and Letter), the blob download, the clipboard copy, full screen and the camera. [Playwright]
9. THE built `index.html` SHALL contain no inline script, no inline `<style>`, no `style=""` attribute and no event-handler attribute, and styling by the React `style` prop SHALL be limited to the CSSOM-set `stroke-dasharray` of `.ring__track` and `.ring__bar` (Requirement 19, criterion 13), each reported in the task report. [unit]
10. THE App documentation SHALL state that the policy is header-only (frame-ancestors is ignored in a meta element). [manual]
11. THE `vercel.json` SHALL serve `/THIRD_PARTY_NOTICES` with `Content-Type: text/plain; charset=utf-8`, so that the links "Third-party notices" of Home_View and About_View open the text in the browser, and the e2e harness server SHALL do the same. [Playwright]

### Requirement 16: Privacy

**User Story:** As a user with a private file, I want proof that nothing leaves my device and nothing is kept, so that I can trust Strip with it.

#### Acceptance Criteria

1. WHEN the Request_Log test runs every flow of Requirement 21 (all Routes, paper, screen, image intake, camera, download, print, offline reload), THE Request_Log SHALL contain only same-origin requests whose paths are in the built asset list, and none to any other origin. [Playwright]
2. THE Request_Log SHALL contain no request with a body and no method other than GET (and the service worker's own GETs). [Playwright]
3. THE App SHALL contain no analytics, no beacon and no third-party script, and the source and bundle SHALL contain no `sendBeacon`, `XMLHttpRequest`, `WebSocket` or `EventSource`. [unit]
4. WHEN the flows of Requirement 21 finish, THE `localStorage`, `sessionStorage` and `document.cookie` SHALL be empty, `indexedDB.databases()` SHALL list none, and every Cache API entry SHALL be a URL of the precache list, so that no file byte or file name is stored. [Playwright]
5. THE App SHALL hold file bytes (and the retained Packets of Requirement 12, criterion 24) in memory only, drop them on "Remove file", on removal of a photo, and on a new Scan_Session, and revoke the download object URL after use. [unit]
6. THE built assets SHALL contain no `https://` or `http://` URL other than REPO_URL (Resolved question 23) and the SVG namespace `http://www.w3.org/2000/svg`. [unit]
7. THE App SHALL NOT persist the Speed, code size, Stream_Mode or paper choice. [Playwright]
8. THE App SHALL NOT request `fonts.googleapis.com` or `fonts.gstatic.com`, proved by the Request_Log. [Playwright]

### Requirement 17: Accessibility

**User Story:** As a user who cannot use a mouse or who prefers less motion, I want to operate every screen with the keyboard and a screen reader, so that Strip is usable by everyone.

#### Acceptance Criteria

1. THE App SHALL let a keyboard-only user complete a paper send (choose a file, choose the output, continue, choose A4 or Letter, print), a screen send (continue, pause, play, step with Previous and Next, switch to step mode and back, change speed and size, enter and exit full screen) and every Receive button, in a Playwright run that uses no pointer events. [Playwright]
2. THE App SHALL keep the `:focus-visible` outline of the Stylesheet and SHALL add no `outline: none`. [unit]
3. FOR EACH screen and state board of Appendix A, THE Playwright ARIA snapshot SHALL equal the roles and names of the board (including `aria-label`, `aria-current`, `aria-live`, `role="status"`, `role="alert"` and `role="note"`). [Playwright]
4. WHEN the route changes by client navigation, THE App SHALL move focus to the main heading of the new view. [Playwright]
5. THE App SHALL keep every control at least `--tap` (48 px) tall as the Stylesheet defines, and SHALL NOT shrink them. [Playwright]
6. WHEN the user presses Space on Stream_View with focus on the page body, THE Stream_View SHALL toggle play and pause, and WHEN focus is on a button or input, Space SHALL keep its native action. [Playwright]
7. WHERE `prefers-reduced-motion: reduce` matches, THE App SHALL turn chrome animation off through the Stylesheet and SHALL apply Requirement 11, criterion 8 to the stream. [Playwright]
8. THE Image_Intake control, the Previous and Next buttons, the "Full screen" and "Exit full screen" links, the torch button and the Photo_List remove buttons SHALL have the accessible names of the boards ("Add photo of a page", "Previous", "Next", "Full screen", "Exit full screen", "Torch", "Remove {name}"). [Playwright]
9. WHILE the `input[type="file"]` of an Image_Intake `label.picker` has keyboard focus, THE Stylesheet rule `.picker:focus-within` SHALL show the focus outline on the label. [Playwright]

### Requirement 18: Performance and bundle gates

**User Story:** As a maintainer, I want the size and speed of the app reported and bounded, so that a regression is caught before release.

#### Acceptance Criteria

1. THE build SHALL print the Bundle_Report (every emitted asset with raw, gzip and brotli bytes, and totals) and SHALL write it as the JSON file `apps/strip/bundle-report.json`, outside `dist` and gitignored. [unit]
2. THE total gzip bytes of the assets the first visit to `/` loads, excluding the 946,598-byte reader `.wasm` and the decode worker, SHALL be at most 400 KB (the First_Load_Budget; Resolved question 26; revisited after the first Bundle_Report). [unit]
3. THE reader `.wasm` SHALL stay at most 1,000,000 bytes (symbols Requirement 7, criterion 8). [unit]
4. WHEN the route `/` loads, THE Request_Log SHALL contain no page-initiated `.wasm` request (`request.serviceWorker() === null`; the service worker precache of Requirement 14, criterion 4 is excluded), and THE page SHALL request the `.wasm` only after the first receive action. [Playwright]
5. THE perf script SHALL report the time to encode and render T symbols at the FILE_CAP_BYTES size (T = 200 for 256 KB), with no budget. [perf]
6. THE `pnpm typecheck`, lint and test commands SHALL pass for the App, and the TypeScript compiler SHALL report zero errors under `strict`. [unit]

### Requirement 19: Design hand-off conversion

**User Story:** As the designer, I want the boards converted without restyling, so that the app looks exactly as I drew it.

#### Acceptance Criteria

1. THE App SHALL convert each routed Board and each state Board of Appendix A to React components keeping class names, text content, element structure and ARIA attributes, and the task report SHALL list every deviation with its reason. [manual]
2. THE App SHALL ship the Stylesheet as a copy that equals `design/project/strip.css` byte for byte, and a unit test of the App SHALL assert that the SHA-256 of the shipped copy equals its own pinned constant and equals the SHA-256 of `design/project/strip.css` (currently `e8d66a6a098a6fa51fa3a6fe9ad01f2445e2a8400818e84192b142fbe8cd6d37`, pinned for the design file by `tools/design.test.ts`; a new export means a new hash, deliberately), with every `@font-face` rule in the Fonts_Stylesheet and every other addition in the Additions_Stylesheet (Resolved question 17). [unit]
3. THE App SHALL self-host IBM Plex Sans and IBM Plex Mono at weights 400, 500 and 600 (the weights of the boards' font link) as OFL woff2 files under `apps/strip/public/fonts`, with the licence file included and the `@font-face` rules in the Fonts_Stylesheet. [unit]
4. THE built HTML, CSS and JavaScript SHALL contain no `fonts.googleapis.com` string. [unit]
5. THE App SHALL NOT ship `codegen.js`, `support.js`, `canvas.json`, the design `index.html`, Main.dc.html, Symbol.dc.html or any `*.dc.html`, and SHALL NOT import them (the test-only Baseline asset `design/project/support.js` is excluded from lint and from the build). [unit]
6. THE App SHALL translate each Template_Construct to a React equivalent and the task report SHALL list each construct used: `{{ }}` as JSX expressions, `sc-for` as `Array.map` with a key, `sc-if` as conditional rendering, `dc-import` as a component import (the `Symbol` import as the Symbol_Component), `x-dc` removed, `helmet` removed, `data-dc-script` component classes as function components with props (`mobile`, `stage`, `mode`, `size`, `phase`, `kind`, `seed`, `label`), and `hint-*` attributes dropped. [manual]
7. THE `apps/strip/src` and the built output SHALL contain none of the strings `{{`, `sc-for`, `sc-if`, `dc-import`, `x-dc`, `<helmet`, `data-dc-script`, `hint-placeholder` and `hint-size`. [unit]
8. THE Additions_Stylesheet SHALL contain only these rules, each listed as an addition in the task report: (a) `@media screen { .paper--off { display: none; } }` for the sheets that are not previewed; (b) `.vf video, .vf canvas` filling the viewfinder (the camera element is not in the design); (c) the `#diag` readout; and no `body { margin: 0 }` rule, because the Stylesheet carries it and no board has an inline `<style>` block (0 of 34). [unit]
9. THE App SHALL render every code from `@strip/symbols` and SHALL NOT call `StripCode.make` or ship `codegen.js`. [unit]
10. THE App SHALL compute each board `aria-label` that carries an interpolation (ring "Progress {pct} percent", stage and code labels, tile labels, "{pct} percent solved", "Remove {name}", "Page {p} of {N} preview") at render time. [unit]
11. THE `page--m` and `fs--m` root classes SHALL appear only in the Harness_Build. [unit]
12. THE Symbol_Component SHALL replace Symbol.dc.html and SHALL produce exactly the markup of that board from the public `SymbolMatrix` returned by `encodeSymbol` (and not by parsing `renderToSvg`): `svg.code` with `viewBox="0 0 {S} {S}"`, `shape-rendering="crispEdges"`, `role="img"` and the `aria-label` given, one `rect.code__bg` with `width` and `height` {S}, and one `path.code__ink` whose `d` is the dark modules of the matrix as merged horizontal runs `M{x + 4} {y + 4}h{w}v1h-{w}z` in row-major order (as codegen.js does), where {S} is `matrix.size + 8` (the matrix plus the 4-module Quiet_Zone on each side); for the default version 30 the matrix size is 137 and {S} is 145, and a matrix of another version (a Perf or an override option) needs another viewBox ({S} = 17 + 4 × version + 8). THE App SHALL use it for every code: the stage, the Full_Screen_State, the Home specimen and all 9 tiles of a page. [property]
13. THE App SHALL set the ring tick pattern from the Decoder's `totalBlocks` K through the React `style` prop on the SVG elements `.ring__track` and `.ring__bar` (CSSOM `stroke-dasharray`, allowed under the CSP), with `tick = 2π × 44 / K`, on-length `tick × 0.723` and gap `tick × 0.277` (the board's 1.8 : .69 ratio), so that the ring has one tick per source packet for any K and keeps the Stylesheet pattern (no `style` set) while K is unknown; the Stylesheet stays byte-identical and the Additions_Stylesheet has no ring rule (Resolved question 34). [unit]

### Requirement 20: Fidelity gate

**User Story:** As the designer, I want a failing test when the app drifts from the boards, so that fidelity is enforced and not hoped for.

#### Acceptance Criteria

1. THE Fidelity_Gate SHALL contain one Playwright screenshot-diff test for each of these 53 targets: the 15 desktop boards Home, Send, SendEmpty, SendTooLarge, SendEmptyFile, SendScreen, SendScreenPaused, SendScreenStep, SendScreenFull, SendPaper, SendPaperLetter, Receive (scanning), About, Errors and ErrorsAll; the 14 mobile boards HomeMobile, SendMobile, SendEmptyMobile, SendTooLargeMobile, SendEmptyFileMobile, SendScreenMobile, SendScreenPausedMobile, SendScreenStepMobile, SendScreenFullMobile, SendPaperMobile, SendPaperLetterMobile, AboutMobile, ErrorsMobile and ErrorsAllMobile; the 10 Receive_Phases at 390 px (ReceiveStates cells; ReceiveState.dc.html is the component); and the 14 Error_Panel kinds (ErrorState.dc.html is the component). These are all 32 screen, state and component boards except Main and Symbol, plus ErrorsAll; the Receive board has no mobile file. The Receive_Phase and Error_Panel targets render ReceiveState.dc.html and ErrorState.dc.html through wrapper boards synthesized by the Baseline server, so that no file under `design/` changes. [Playwright]
2. THE Baseline SHALL be rendered from the original design HTML in Chromium by the design runtime `design/project/support.js` (present in the repository, 188,749 bytes; precondition P1), a test-only Baseline asset, never shipped and excluded from lint, and the test code SHALL NOT contain a custom renderer for the Template_Constructs; a test SHALL fail if a Baseline page requests `cdn.jsdelivr.net` (no board requests it). [Playwright]
3. THE Baseline and the App screenshot SHALL use the same viewport (the board sizes of `canvas.json`: 1280 px wide for the desktop boards and 390 px for the mobile boards, each with the `canvas.json` height of its board entry as the minimum viewport height and a `fullPage` capture; 390 × 860 for a Receive_Phase cell, the `hint-size` of ReceiveStates.dc.html; 420 × 620 for an Error_Panel kind; 1280 × 800 and 390 × 844 for the Full_Screen_State), a device pixel ratio of 1, animations disabled and the same self-hosted fonts, with the Google Fonts URL answered from the self-hosted files by request routing. [Playwright]
4. THE diff threshold SHALL be 1% of pixels, with the QR_Mask over every code region. [Playwright]
5. WHERE a Board shows an instance value that the App computes (the Receive counters, "28 MB", "24 / 24", "82 / 111", "1.4 MB"), THE Harness_Build gallery SHALL feed the board's own instance value to the App component as a fixture prop, or the region SHALL be masked, each substitution and each mask being listed in the task report; the fixture file is "field-notes-2026.pdf" of 188,416 bytes, so that the Send, Paper and About text for the sample file (184 KB, 111 packets, 149 symbols, 17 pages) equals the board without substitution (Resolved question 22). [Playwright]
6. IF a Fidelity_Gate test fails, THEN THE task SHALL fail. [manual]
7. THE Fidelity_Gate SHALL run in the Harness_Build, which includes the gallery routes of Resolved question 21 (a route per state board, taking the board props `stage`, `mode`, `size`, `phase`, `kind` as search parameters) and the `page--m` and `fs--m` classes. [Playwright]
8. THE App SHALL mark each element that exists only as an addition outside the design (today the paper warning of Requirement 9, criteria 8 and 11) with the attribute `data-addition`, and THE Fidelity_Gate SHALL hide those elements with a Playwright-injected stylesheet in both the Baseline and the App screenshot, each addition being covered by its own functional test. [Playwright]
9. THE Fidelity_Gate task SHALL NOT start until precondition P1 is met, and the status of P1 SHALL be recorded in the task report. [manual]
10. THE Fidelity_Gate SHALL compare the Paper_View and the Letter board at the same viewport, with the Letter radio checked and no class set by the App (Requirement 4, criterion 14), and the printed A4 and Letter PDF page sizes SHALL be checked by Requirement 10, criterion 10. [Playwright]

### Requirement 21: End-to-end round trips

**User Story:** As a maintainer, I want automated proof that a file goes in one side and comes out byte for byte on the other, so that a release is never a guess.

#### Acceptance Criteria

1. WHEN the Playwright paper test chooses a deterministic fixture file on `/send`, continues to `/send/paper`, renders every Print_Sheet in print emulation at a device pixel ratio that gives at least 4 pixels per module, and adds the page images (each carrying all {PER_PAGE} = 9 symbols of its page, fewer on the last page) to Image_Intake on `/receive` one at a time, THE receiver SHALL obtain every symbol of each page image through Multi_Symbol_Read (dependency D2), and THE downloaded file SHALL be byte-identical to the fixture with the same name and MIME type, and the progress SHALL increase as pages are added. [Playwright]
2. WHEN the last page (repair Packets only) is withheld, THE Receive_View SHALL still reach `done` with the identical file. [Playwright]
3. WHEN the Playwright screen test steps the stream in the Stream_Mode `step` with Next, captures the stage at each step at 4 or more pixels per module, and feeds the captures to the production Frame_Loop through an injected camera stream, THE downloaded file SHALL be byte-identical to the fixture. [Playwright]
4. WHEN Packets of a second file are interleaved on the camera, THE Receive_View SHALL enter `dup`, count the skipped Packets, and after "Keep current file" complete the first file. [Playwright]
5. WHEN the test builds Packets whose payload is altered but whose CRCs are valid, so that the hash differs, THE Receive_View SHALL enter `failed`, show the hashes of the rejected status and offer no download. [Playwright]
6. WHEN the camera permission is denied, THE Receive_View SHALL enter `denied`, WHEN `navigator.mediaDevices` is removed, THE App SHALL show the Error_Panel kind `camera`, and WHEN `getUserMedia` rejects with NotFoundError, THE Receive_View SHALL enter `nocam`, where "Add photo of a page" still completes a file. [Playwright]
7. WHEN a file of FILE_CAP_BYTES + 1 bytes is chosen, THE Send_View SHALL enter the Send_State `toolarge` and SHALL NOT navigate, and WHEN a file of 0 bytes is chosen, THE Send_View SHALL enter the Send_State `emptyfile`. [Playwright]
8. WHEN no Packet adds a solved block for STALL_TIMEOUT_MS (fake clock) after the first accepted Packet, THE Receive_View SHALL show the Error_Panel kind `stall`, and WHEN no symbol is read for NOTHING_TIMEOUT_MS (fake clock), THE Receive_View SHALL show the Error_Panel kind `nothing`. [Playwright]
9. WHEN the Receive_View is cancelled and restarted, THE counters SHALL return to 0. [Playwright]
10. THE real-device check of `docs/device-test.md` SHALL be run on at least three phones, with the paper and screen sets printed and shown from the App, and the result recorded. [manual]
11. WHEN the same frame is read twice from the camera, THE Receive_View SHALL enter `repeat` and return to `scan` on the next new Packet, and WHEN a photo is removed from the Photo_List, THE progress SHALL equal the progress of a fresh Scan_Session fed with the remaining sources. [Playwright]
12. WHEN the Letter radio is checked and the user prints, THE generated PDF SHALL have N pages of 215.9 mm by 279.4 mm, and WHEN the A4 radio is checked, N pages of 210 mm by 297 mm. [Playwright]

### Requirement 22: Dependencies, boundaries and purity

**User Story:** As the project owner, I want every dependency approved and every boundary enforced, so that supply-chain risk and architecture stay under control.

#### Acceptance Criteria

1. THE App SHALL import only the public barrels of `@strip/codec` and `@strip/symbols` and the subpath `@strip/symbols/wasm-url`, enforced by ESLint. [unit]
2. THE `apps/strip/src` SHALL contain no `Math.random`, `Date.now` or `performance.now` outside `apps/strip/src/clock`, enforced by ESLint. [unit]
3. WHEN a task adds a package entry to a package.json, THE same task SHALL add its row (name, exact version, license, reason) to `docs/dependencies.md` and SHALL have the user's approval first; the packages approved by the user are `react`, `react-dom`, `@types/react` and `@types/react-dom`, each pinned exactly and added with its row in the task that adds it (Resolved question 24), and any other package, including `@vitejs/plugin-react`, any router or service-worker library, needs a new approval; React is the latest 19.x, with `react` and `react-dom` at the same exact version and `@types/react` and `@types/react-dom` at 19.x exact versions, chosen in the first dependency task and recorded in `docs/dependencies.md` (Resolved question 37). [unit]
4. THE `apps/strip/package.json` SHALL use exact versions only and SHALL contain no dependency on `qr` or `zxing-wasm`. [unit]
5. THE THIRD_PARTY_NOTICES file SHALL name each third-party component this spec adds to the shipped bundle or assets (React and react-dom under MIT, IBM Plex under OFL-1.1) with its exact version, licence and licence text, and a unit test SHALL assert each. [unit]
6. THE `apps/strip/src` SHALL NOT import `zod`, so that the zod eval probe raises no `securitypolicyviolation` event, and the few App inputs SHALL be validated by hand (Resolved question 30); removal of the unused `zod` 4.6.7 entry from `apps/strip/package.json` and of its `docs/dependencies.md` row is done by the lead in a separate commit, not by an App task (dependency D4). [unit]
7. THE App tests SHALL NOT depend on a DOM emulation library (Resolved question 24). [unit]

## Correctness properties to be numbered in design

- File intake: for any file of 1 to FILE_CAP_BYTES bytes, App encode then codec decode returns the same bytes, name and MIME.
- Send states: for any file size, the Send_State is `emptyfile` at 0, `chosen` from 1 to FILE_CAP_BYTES and `toolarge` above, and the bytes are read only in `chosen`.
- MIME fallback: for any `File.type` string, the Metadata MIME is a valid codec MIME type, and `application/octet-stream` when the input is empty or invalid.
- Metadata rejection: for any name that breaks the codec rules, the App shows a disposition and never alters the name.
- Size formatting: for any byte count, the "{n} KB", "{n.n} MB" and "{bytes} bytes" text round-trips to the byte count within the rounding rule, and `{cap}` is the cap divided by 1024.
- Hash chip: for any bytes, the chip is the first 12 hex digits of SHA-256 in 3 groups of 4, and equals the Metadata_Record hash.
- Pagination: for any T of 1 or more, N = ceil(T / PER_PAGE), every Packet appears on exactly one page in sequence order, labels and captions are unique and consistent.
- Paper completeness: for any file and any permutation of the tile Packets, a codec Decoder completes with identical bytes.
- Symbol cell: for any Packet of 1732 bytes, the symbol is version 30 ECC L, 145 modules wide with the quiet zone.
- Symbol markup: for any SymbolMatrix, the Symbol_Component path `d` describes exactly the dark modules shifted by the quiet zone, and the viewBox is the matrix size plus 8.
- Stream order: for any sequence of play, pause, step, Next, Previous and speed actions, `next()` yields consecutive numbers from 0 and the shown number follows the model.
- Stream rate: for any fps from 2 to 15 and a fake-clock run, the number of Packets shown is fps times the duration within 1.
- Progress monotonicity: for any Packet sequence, Packets seen, distinct packets, blocks solved and percent never decrease (until a photo is removed), percent is 100 only when complete.
- Receive state machine: for any event sequence (Packets of sessions A and B, duplicates, corrupt Packets, timers, user actions), the phase is one of the ten values, `done` holds only when the codec is complete, no download is offered unless complete, the skipped counter equals the number of SESSION_MISMATCH statuses from the camera, and `repeat` is left on the next accepted Packet or after REPEAT_HOLD_MS.
- Timers: for any sequence of outcomes on a fake clock, `stall` fires only after a first accepted Packet and 20 s without a new solved block, `nothing` fires only after 30 s without a `found` outcome, and `stall` wins when both hold.
- Photo removal: for any list of photos and any removed row, the rebuilt Scan_Session equals a fresh Scan_Session fed with the remaining sources in their original order.
- Error mapping is total: every code of every union has exactly one disposition and no raw code reaches the DOM.
- Ring arc: for any percent from 0 to 100, the arc path is well formed, empty at 0 and the full circle at 100; for any K of 1 or more, the tick period times K equals the circumference.
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
- Changes to `@strip/codec` and `@strip/symbols` (the amendments that this spec needed are listed under Dependencies on other work and were made in their own specs, not here).
- Lighthouse score budgets.
- Persisting any user preference or file.
- Light or dark theming (the Stylesheet states that code and print colours are fixed and never themed).

## Dependencies on other work

The App depends on the following changes outside `apps/strip`. None is made by the App tasks; each was done in its own spec first.

- **D1: Codec digest amendment (DONE).** A HASH_MISMATCH rejection carries the first 12 hexadecimal digits of the expected and of the actual SHA-256 as `hashes.expected` and `hashes.actual` of the `rejected` push status. Done in the codec spec (commit `1051a8d`, with the property P17 in `ec9cb63` and the checkpoint in `1159e7b`); Requirement 5, criterion 9 and Requirement 7, criterion 13 read it (Resolved question 18).
- **D2: Symbols multi-symbol capability (DONE).** The option `maxSymbols` of `decodeFrame` and `createFrameDecoder` and the outcome `found_many` (`symbols`, `skipped`), with the worker protocol transfer list. Done in the symbols spec, tasks 5.1 to 5.7 (commits `b83d1f3` to `0afbeab`, including the page-photo gate 100/100 pages and the Playwright multi-symbol test `02f4276`); Requirement 12, criteria 11 and 21 and Requirement 21, criteria 1 and 2 read it (Resolved question 11).
- **D3: Symbols CSP amendment (DONE).** `worker-src 'self'` in the Strip_CSP delivery and the worker URL test, commit `e138dac` (task 5.5); `STRIP_CSP` stays unchanged and `APP_CSP` equals it (Resolved question 20).
- **D4: Remove `zod` from `apps/strip` (done by the lead).** The repository change (package.json entry and `docs/dependencies.md` row) is a separate commit outside the App tasks; Requirement 22, criterion 6 stays.
- **D5: Codec `pageRepairCount` export (codec spec, Group 8, not done).** `pageRepairCount(K)` is the number of repair Packets `page()` adds for K blocks; Requirement 7, criterion 14 and Requirement 2 read it (Resolved question 33).
- **P1: Fidelity precondition (support.js present).** `design/project/support.js` is present (188,749 bytes, design export 2). No board requests the three CDN libraries it can load, so the Baseline needs no extra file (Resolved question 22); a test fails if `support.js` requests `cdn.jsdelivr.net`.

## Appendix A: Screen and state inventory

The 34 boards are the 6 routed screens with their states and variants, the 4 galleries and components, and 2 non-screen boards. Letter, the Send_States, the Stream_Modes and the Full_Screen_State are states of the same Routes and not new Routes. ErrorsAll and ReceiveStates are Harness_Build galleries only (`/__gallery/*`). In the table, "prop" is the prop of the board's DCLogic component and "M" is the `mobile` variant that imports the desktop board with `mobile="yes"` (root class `page--m`, or `fs--m`).

| # | Screen | Boards (desktop; M = mobile) | Prop | Route or surface | Fidelity targets |
|---|---|---|---|---|---|
| 1 | Home | Home.dc.html; HomeMobile | – | `/` | 2 |
| 2 | Send, step 1 | Send.dc.html (`chosen`); SendEmpty (`empty`); SendTooLarge (`toolarge`); SendEmptyFile (`emptyfile`); each with a mobile board | `stage` | `/send` (states of one Route) | 8 |
| 3 | Send, Screen | SendScreen.dc.html (`play`); SendScreenPaused (`paused`); SendScreenStep (`step`); each with a mobile board; SendScreenFull (+ mobile) | `mode` | `/send/screen` (modes and the Full_Screen_State of one Route) | 8 |
| 4 | Send, Paper | SendPaper.dc.html (`a4`); SendPaperLetter (`letter`); each with a mobile board | `size` | `/send/paper` (A4 and Letter in one Route) | 4 |
| 5 | Receive | Receive.dc.html (desktop, `scan`); ReceiveState.dc.html (component); ReceiveStates.dc.html (gallery of 10 phones; no separate mobile file) | `phase` | `/receive`; gallery in the Harness_Build | 1 + 10 |
| 6 | About and privacy | About.dc.html; AboutMobile | – | `/about` (anchors `#privacy`, `#account`, `#caveat`, `#limits`, `#credits`) | 2 |
| 7 | Error states | Errors.dc.html (3 kinds); ErrorsMobile; ErrorsAll.dc.html (14 kinds); ErrorsAllMobile; ErrorState.dc.html (component) | `kind` | inline component; galleries in the Harness_Build only | 4 + 14 |
| – | Design system | Main.dc.html | – | not routed, not shipped, not tested | – |
| – | Symbol placeholder | Symbol.dc.html | `seed`, `label` | replaced by the Symbol_Component | – |

The fidelity targets add to 53 (Requirement 20, criterion 1). The 34 boards are: Main, Symbol, ErrorState, ReceiveState, ReceiveStates, Receive, 2 × Home, 8 × Send, 8 × SendScreen, 4 × SendPaper, 2 × About, 4 × Errors and ErrorsAll.

Routes (Resolved question 21): `/`, `/send`, `/send/screen`, `/send/paper`, `/receive`, `/about`. Unknown paths go to `/`. Board `<title>` values of the desktop boards: Home "Strip home"; Send "Send step 1"; SendScreen "Send on screen"; SendPaper "Send on paper"; Receive "Receive desktop" (the App title is "Receive"); About "About and privacy"; Errors "Error states". The state boards' titles ("Send empty state", "Send on screen paused", and so on) are used by the Harness_Build only.

Other files in `design/project`: `strip.css` (the Stylesheet, shipped as a byte-identical copy), `codegen.js` (never shipped; only Symbol.dc.html calls it), `canvas.json` (never shipped; the board sizes are the Fidelity_Gate viewports), `index.html` (the design's board index, never shipped) and `support.js` (the design runtime, present, 188,749 bytes; a test-only Baseline asset, never shipped; precondition P1). The Fonts_Stylesheet `fonts.css` and the Additions_Stylesheet `strip-additions.css` are the only App-owned CSS files.

## Appendix B: Design-folder inventory (design export 2)

Counts were taken by searching the 34 `*.dc.html` files in `design/project` and checked against the previous export (`git diff HEAD~1 -- design/project`). Counts of opening tags and of opening plus closing tags are both given where they differ.

| Item | Count | Where and handling |
|---|---|---|
| Board files | 34 | 32 screen, state and component boards, Main (design system) and Symbol (placeholder); was 17 |
| Other design files | 5 | `strip.css` (about 36.7 KB), `canvas.json`, `index.html`, `codegen.js`, `support.js` (188,749 bytes) |
| `style=""` attributes in markup | 0 | The only match is a text mention in Main.dc.html (line 176) |
| Inline `<style>` blocks | 0 | Was 17 (`body{margin:0}`); the rule moved into `strip.css`, so no Additions_Stylesheet rule is needed |
| Google Fonts `<link>` (fonts.googleapis.com) | 34 | In every board; never shipped; fonts are self-hosted |
| `https://github.com/alwayskumar-global/strip` | 3 | Home footer, About credits button, About footer (REPO_URL, Resolved question 23); navigations, not fetches |
| `/THIRD_PARTY_NOTICES` links | 3 | Home footer, About credits row, About footer ("Third-party notices"; symbols R15.5) |
| `{{ }}` interpolations | 191 | Was 120 |
| Attributes that hold `{{ }}` | 15 names | `aria-label` 6, `checked` 3, `class` 20, `d` 5, `disabled` 5, `hint-placeholder-val` 33, `href` 2, `kind` 1, `label` 2, `list` 15, `max` 1, `phase` 1, `seed` 3, `value` 36 (counts are occurrences) |
| `sc-for` | 15 opening, 30 with closing tags | Lists: tiles, rows, tips, steps, photos, cells, kinds |
| `sc-if` | 33 opening, 66 with closing tags | State switches in Send, SendScreen, ReceiveState, ErrorState |
| `dc-import` | 32 opening, 64 with closing tags | State boards, mobile variants, galleries, and `Symbol` (6 uses: Home, Main, ReceiveState, SendPaper, SendScreen, SendScreenFull) |
| `x-dc` wrappers | 34 | One per board |
| `helmet` | 34 | One per board; holds only the Google Fonts link now |
| `data-dc-script` component classes (DCLogic) | 34 | Props `mobile`, `stage` (4 values), `mode` (3), `size` (2), `phase` (10), `kind` (14), `seed`, `label` |
| `hint-*` attributes | 80 | `hint-placeholder-val` 33, `hint-placeholder-count` 15, `hint-size` 32 |
| `support.js` script tags | 34 | One per board; `index.html` mentions `support.js` in prose only (no script tag in `index.html`) |
| `codegen.js` script tags | 34 | One per board; `window.StripCode` is used only by Symbol.dc.html (`StripCode.make(137, seed, 4)`) and defined in `codegen.js` |
| `role="note"` | 1 | The Photosensitivity_Notice in SendScreen.dc.html |
| Mobile variants | 14 files | Import the desktop board with `mobile="yes"`, which sets root class `page--m` (or `fs--m`); production relies on `@container page (max-width: 760px)`; Receive has no mobile file (ReceiveStates is the mobile gallery) |
| `strip.css` | 36,682 bytes | SHA-256 `e8d66a6a098a6fa51fa3a6fe9ad01f2445e2a8400818e84192b142fbe8cd6d37`; no `@font-face`, no `url()`; contains `body { margin: 0 }`, the "ADDITIONS (revision 2)" block, named pages `@page a4` and `@page letter`, `.paper--letter` and `:has(#paper-letter:checked)`, ring ticks `stroke-dasharray: 1.8 .69` for 111 ticks |

## Appendix C: Conflicts between the boards and the codec and symbols specs

Rows marked "Resolved by the updated design" were conflicts of design export 1 that export 2 removes. The other rows remain or are new.

| # | Board (file) | Board says | Real value or spec | Handling |
|---|---|---|---|---|
| C1 | Send.dc.html | Export 1: "96 packets + repair · ≈ 15 s loop at 8 fps" for 184 KB | K = 111, T = 149 | Resolved by the updated design: the board now says "111 packets + repair · ≈ 14 s loop at 8 fps"; template kept, numbers computed (Requirement 2, criterion 7; see C30 for the loop figure) |
| C2 | Send.dc.html | Export 1: "27 codes · 3 pages" | 149 symbols, 17 pages at 9 per page | Resolved by the updated design: "149 symbols · 17 pages · black on white" |
| C3 | SendScreen.dc.html | Export 1: "Packet 38 of 96 + repair", 45-module code | v30, 145 modules including the quiet zone | Resolved by the updated design: "Packet 38 of 111 + repair" and the Symbol board is 145 modules; Medium 560 CSS px gives 3.86 px per module (Resolved question 13) |
| C4 | SendPaper.dc.html | Export 1: 33-module tiles, 3-module quiet zone | 4-module quiet zone | Resolved by the updated design: the Symbol board is 137 + 2 × 4 = 145 |
| C5 | ReceiveState.dc.html | Export 1: "36 / 96", "All 96 blocks solved" | Counters from the Decoder | Resolved by the updated design: totals are 111 (the sample file); the instance counters (52, 41, 126 …) remain fixtures and are computed |
| C6 | ReceiveState.dc.html, ErrorState.dc.html | Ring percent 37 for 41 / 111, 16 for 18 / 111, 74 for 82 / 111 | `floor(100 × 41 / 111)` is 36, `floor(100 × 18 / 111)` is 16, `floor(100 × 82 / 111)` is 73: the export 2 numbers fit rounding to the nearest integer, not floor | REMAINS (smaller): the App keeps `floor` so that the ring never shows 100 before the file is complete (Requirement 12, criterion 7); the gallery feeds the board's value as a fixture (Requirement 20, criterion 5), so the diff is unaffected |
| C7 | Board numbers | Export 1: K = 96 for 184 KB | K = 111 | Resolved by the updated design (export 2 uses K = 111, T = 149, 17 pages) |
| C8 | Receive | One code at a time | A page holds 9 symbols | Resolved by dependency D2 (done): Multi_Symbol_Read |
| C9 | Receive | Export 1: no image control | Image intake in scope | Resolved by the updated design: `.capture`, `label.picker`, Photo_List, count tag; Resolved question 15 revised |
| C10 | SendScreen | Export 1: no Play label, step mode, full screen | In scope | Resolved by the updated design: Stream_Modes, `div.stepctl`, "Full screen" link and the `.fs` board |
| C11 | strip.css, SendPaper | Export 1: Letter preview only; `@page` without a size | Letter cannot use an inline style under the CSP | Resolved by the updated design: named pages `@page a4` and `@page letter`, `.paper--letter` and `:has(#paper-letter:checked)`; the CSSOM approach is no longer needed (Resolved question 14 revised) |
| C12 | SendPaper | Export 1: no session id in the header | Session id required | Resolved by the updated design: "Page 1 of 17" and "Session 7F3A" in `.paper__id`, and the "Session" row |
| C13 | ReceiveState | Export 1: "Expected 9f2c 41ab e07d…, got …" | Codec digests | Resolved by dependency D1 (done) and by the updated design: the banner is now "Expected a1b2c3d4e5f6, got 9f8e7d6c5b4a" (12 ungrouped digits, no ellipsis), shown verbatim as a template (Requirement 5, criterion 9; the chips elsewhere keep "a1b2 c3d4 e5f6…") |
| C14 | ReceiveState | HUD "Session 7F3A ≠ 4C21" (4 hex digits) | The codec Session_Id is 32 bits (8 hex digits) | REMAINS, resolved by Resolved question 19 (first 4 digits, 8 on collision) |
| C15 | ReceiveState, ErrorState | Export 1: 3 Error kinds | 10 codec, 4 symbols, 4 ignore reasons | Resolved by the updated design: 14 kinds and 10 phases; the codes that have no board kind map to `internal` (C42, Appendix E) |
| C16 | symbols R9.3, R9.5 | Strip_CSP leaves `worker-src` unset | App needs `worker-src 'self'` explicit | Resolved by dependency D3 (done, `e138dac`); `STRIP_CSP` unchanged and `APP_CSP` equals it |
| C17 | strip.css | "Code playback … keeps its frame rate" under reduced motion | Reduced motion must be respected for the stream | REMAINS, handled in App logic (Requirement 11, criteria 8 and 9); the design now agrees (Photosensitivity_Notice: "Step mode is the default when your system asks for reduced motion") |
| C18 | Board SVG | `svg.code` with `rect.code__bg` and `path.code__ink` | `renderToSvg` returns a string with `fill` attributes and no classes | Resolved by the updated design and a new rule: Symbol.dc.html says "The application replaces this whole component with its own renderer"; the Symbol_Component builds the markup from the public SymbolMatrix (Requirement 19, criterion 12) and does not parse `renderToSvg` |
| C19 | About.dc.html | "Max file size 256 KB"; "Close the tab and the session is gone" | Cap 256 KB (Resolved question 10); statement true while nothing is persisted | REMAINS, no conflict: copy verbatim; the cap is computed; the new "Example" row is static board text that equals the codec for the sample file |
| C20 | Send.dc.html | SHA-256 chip shows 12 hex digits before encoding | `sha256WebCrypto` is the function the codec uses | No conflict (Requirement 2, criterion 5) |
| C21 | Send.dc.html | Primary button "Continue to Screen" only | A Paper choice needs its own label | REMAINS: "Continue to Paper" derived (Resolved question 15) |
| C22 | Boards | Link texts to `*.dc.html` | Routes | Translated (Requirement 8, criterion 5) |
| C23 | Errors.dc.html | Export 1: no camera-device kind | NotFoundError differs from a missing API | Resolved by the updated design: kind `nocamera` and phase `nocam`; the kind `camera` keeps "Camera API: Missing" |
| C24 | design/project | `strip.css` at `design/project/strip.css` | The brief wrote `design/strip.css` | Real path used |
| C25 | Main.dc.html | Self-host both families under the CSP | `strip.css` has no `@font-face` | REMAINS: Fonts_Stylesheet beside the byte-identical `strip.css` (Resolved question 17); the `body { margin: 0 }` part is Resolved by the updated design |
| C26 | symbols R15.5 | The app links to THIRD_PARTY_NOTICES | Export 1 boards had no link | Resolved by the updated design: "Third-party notices" in the Home footer, About credits row and About footer (Requirement 1, criterion 5; Requirement 6, criterion 5) |
| C27 | codec spec, zod | Zod carries an eval probe that trips a strict CSP | `zod` 4.6.7 is a dependency of `apps/strip` | REMAINS, Resolved question 30 |
| C28 | Receive board | Mock tilted code in the viewfinder | A real viewfinder needs `<video>` and canvas | REMAINS as an addition: the mock `.vf__code` is not shipped, the camera element is the App's own (Requirement 19, criterion 8); the video region is under the QR_Mask |
| C29 | none | Paper warning above 64 KB (PAPER_WARN_BYTES) | Resolved question 10 requires a warning | Approved derived addition (Resolved question 36): `callout--warn` with the drafted copy, marked `data-addition`, hidden from the fidelity diff (Requirement 20, criterion 8) |
| C30 | Send.dc.html, SendScreen.dc.html | "≈ 14 s loop at 8 fps" for 111 packets (K / 8 = 13.9 s) and "Lap n" | Resolved question 27 defines a lap as T Packets (149 / 8 = 18.6 s) | REMAINS: the Send choice line shows T / 8 (Requirement 2, criterion 7), the Lap tag follows Resolved question 27 (Requirement 3, criterion 4); decided: both show the real lap of T Packets, so the Send choice line deviates from the board text (Resolved question 39; Requirement 2, criterion 7) |
| C31 | SendScreen.dc.html | Previous and Next buttons | The Encoder only moves forward | New derived rule: the Stream_Player keeps the last STEP_HISTORY (256) Packets, Previous is disabled at the oldest held Packet (Requirement 11, criterion 18) |
| C32 | ReceiveState.dc.html | `repeat`: "Duplicate frame", "Same frame again", HUD "Packet 41 already seen", banner "Duplicate frame ignored" | The Decoder returns `ignored` DUPLICATE_PACKET for a frame whose Packet was already accepted | New derived rule: enter `repeat` on a camera duplicate, leave on the next accepted Packet or after REPEAT_HOLD_MS (1500 ms, PROPOSED) without a further duplicate (Requirement 12, criterion 22) |
| C33 | Send.dc.html | Empty, too large and empty-file states; no drag-over state | A drag-over state was approved in export 1 | REMAINS: the App shows no drag-over style; the empty state is the board's (Requirement 2, criterion 13) |
| C34 | SendEmptyFile.dc.html | "File is empty": a 0-byte file is an error | Requirement 9, criterion 5 (export 1) encoded 0 to 256 KB | Follows the design: the range is now 1 to FILE_CAP_BYTES and 0 bytes enters `emptyfile` (Requirement 2, criterion 16); the codec still accepts 0 bytes, so no limit value changes |
| C35 | ReceiveState.dc.html | Phases `empty` ("Start camera") and `ask` ("Allow camera", "Camera: asking") | Resolved question 28 had `ask` as the first state with no automatic prompt | Derived: `empty` is the initial phase; "Start camera" requests the camera and enters `ask` while the request is pending; "Allow camera" requests again when none is pending (Requirement 5, criterion 3); Resolved question 28 revised |
| C36 | ErrorState.dc.html (`imgbig`, `imgmany`) | "photos up to 20 MB can be read" for a 28 MB file; "24 / 24" with "Pages needed 17" | Approved limits: one image at a time, long side resized to 4096, at most 24 images, at most 20 MB per file (Resolved questions 12 and 32) | Resolved: the caps equal the board numbers; the texts are built from the constants (Requirement 9, criteria 9 and 14; Requirement 7, criterion 2) |
| C37 | ErrorState.dc.html (`nothing`, `stall`) | `nothing`: "No symbol has been read for 30 seconds"; `stall`: "No progress for 20 seconds" | Resolved question 28: stall timer starts after the first accepted Packet | Two separate rules (Requirement 12, criterion 12): `stall` after the first accepted Packet and 20 s without a new solved block; `nothing` after 30 s without any `found` outcome with the camera on; `stall` wins when both hold |
| C38 | ReceiveState.dc.html | "Packets seen" 52 beside "Blocks solved" 41 and a "Distinct packets" meter 41 of 111; `dup` shows 66 = 52 + 14 skipped | Export 1 and Requirement 12, criterion 7 defined "Packets seen" as `distinctPackets` | Follows the design: "Packets seen" is Packets_Seen (every Packet pushed with status `accepted` or `ignored`), the meter shows `distinctPackets` capped at K (Requirement 12, criterion 7; Requirement 5, criterion 17) |
| C39 | Send.dc.html, ReceiveState.dc.html, ErrorState.dc.html | The Send_States `toolarge` and `emptyfile` and the phases `denied`, `nocam`, `failed`, `dup` describe the same conditions as the Error_Panel kinds `size`, `empty`, `denied`, `nocamera`, `hash`, `otherfile` | One condition needs one disposition | REMAINS, derived rule (Requirement 13, criterion 11): the in-view state is used where the view is mounted; the Error_Panel kind is used for the Image_Intake with the camera off (`hash`, `otherfile`) and for paths outside the view (`size` from an Encoder refusal or a stream above the cap, `empty`); `denied` and `nocamera` have no runtime path of their own (Resolved question 40) |
| C40 | ReceiveState.dc.html | Photo rows have a remove button; `imgmany`: "Remove a photo to add another" | The codec Decoder cannot remove a Packet | New derived rule: removing a photo rebuilds the Scan_Session from the retained Packets of the other sources (Requirement 12, criterion 24) |
| C41 | ErrorState.dc.html (`imgmany`) | Row "Pages needed 17" | T = K + R(K) and the codec barrel exported no R(K) | Resolved: codec export `pageRepairCount` (dependency D5; Resolved question 33) |
| C42 | ErrorState.dc.html | 14 kinds, none for UNSUPPORTED_VERSION or BAD_METADATA | Both codec codes can occur (a newer-format strip; a bad file name) | Resolved: both map to `internal`, no new kinds (Requirement 13, criterion 10; Resolved question 35) |
| C43 | strip.css | Ring ticks `stroke-dasharray: 1.8 .69` hard-coded for 111 source packets | A file whose K is not 111 gets no tick per packet | Resolved: the App sets `stroke-dasharray` on the ring elements through the CSSOM (Requirement 19, criterion 13; Resolved question 34) |
| C44 | support.js | The design runtime loads React 18.3.1, ReactDOM 18.3.1 and `@babel/standalone` 7.29.0 from `cdn.jsdelivr.net` | No network at test time and no new dependency without approval | Resolved: no board requests the libraries; a test fails if `support.js` requests `cdn.jsdelivr.net` (Requirement 20, criterion 2) |
| C45 | ErrorState.dc.html (`size`) | "{name} is {size}" names a file | A receiver stream above the cap has no file name | Derived: the receiver shows the `size` kind with the sender-side copy, the name replaced by "This strip" and the size read from `decodePacket(bytes).totalLength`, the File row omitted (Appendix E) |
| C46 | SendScreenFull.dc.html, strip.css | `.fs` is 800 px high (390 × 844 in `fs--m`) and a link to a second board | Full screen should fill the display | Derived: the Full_Screen_State is a state of the same Route; where the Fullscreen API exists the App also requests browser full screen on `.fs`, which the user agent sizes (Requirement 11, criterion 10) |
| C47 | SendScreen.dc.html | The notice is above the stage; `.fs` shows no notice | The user sees the notice before entering full screen | REMAINS, no change: the Full_Screen_State shows what the board shows |

## Appendix D: Receive phase copy (verbatim from ReceiveState.dc.html)

Numbers marked {…} are computed. The ring percent, Packets seen, blocks solved and the Distinct packets meter are the values of Requirement 12, criterion 7. "Cam" is the tag text of `.capture__cam`. "Hint" is the Photo_List text while no photo is added. In all phases the stats show "Packets seen" and "Blocks solved" with " / {K}", and the capture row shows the label "Add photo of a page" with the help "One photo at a time. Add as many pages as you have."

| Phase | Tag (class) | Heading | Message | Primary (class) | Secondary | Viewfinder, HUD or note | Cam and Hint | Banner and extras |
|---|---|---|---|---|---|---|---|---|
| `empty` | "Ready" (`tag`) | "Scan a strip or a screen" | "Start the camera, or add a photo of a printed page." | "Start camera" (`btn btn--primary btn--lg btn--block`) | "Back" | `vf--idle`; note "Camera is off"; camera icon | "Camera: off"; "No photos added yet. Add one page at a time." | ring `ring--dim` 0%; Packets seen 0, Blocks solved 0 |
| `ask` | "Waiting for permission" (`tag`) | "Allow camera access" | "Strip reads codes with your camera. Video is processed on this device and never recorded or sent." | "Allow camera" (primary) | "Not now" | `vf--idle`; note "Camera permission needed"; camera icon | "Camera: asking"; "No photos added yet. You can add a photo instead of using the camera." | ring `ring--dim` 0% |
| `denied` | "Camera blocked" (`tag tag--signal`) | "Camera access denied" | "Your browser blocked the camera for this site. Allow it, then try again." | "Try again" (primary) | "Back" | `vf--idle vf--warn`; note "Camera blocked"; crossed camera icon | "Camera: blocked"; "No photos added yet. Photos of the printed pages work without the camera." | steps list of 3 (`ol.rx__steps`); ring `ring--dim` 0% |
| `nocam` | "No camera" (`tag tag--signal`) | "No camera on this device" | "Receive works without one. Add a photo or scan of each printed page instead." | none; `label.btn.btn--primary.btn--lg.btn--block.picker` "Add photo of a page" | "Back" | `vf--idle`; note "No camera found"; crossed camera icon | "Camera: none"; Photo_List shown | Distinct packets meter shown |
| `scan` | "Scanning" (`tag tag--cobalt`) | "Keep the code in frame" | "Hold steady. Blocks solve as packets arrive; order does not matter." | "Stop scanning" (`btn btn--lg btn--block`) | "Start over" | viewfinder with the camera view and `.vf__scan`; HUD "Looking for packets"; torch when supported | "Camera: on"; Photo_List shown | Distinct packets meter shown |
| `repeat` | "Duplicate frame" (`tag`) | "Same frame again" | "Waiting for a new packet." | "Stop scanning" (`btn btn--lg btn--block`) | "Start over" | `vf--idle`; HUD "Packet {n} already seen"; torch when supported | "Camera: on"; Photo_List shown | banner `callout--tip`, title "Duplicate frame ignored", text "This frame was already counted. Let the sender’s screen advance, or move to the next printed code."; meter shown |
| `dup` | "Other session" (`tag tag--signal`) | "A different transfer is in view" | "Still solving the first file. {n} packets from another session were skipped." | "Keep current file" (primary) | "Switch to new" | `vf--warn`; HUD "Session {A} ≠ {B}"; torch when supported | "Camera: on"; Photo_List shown | banner `callout--warn`, title "Wrong or repeated code", text "Packets from session {A} do not belong to this file. Point the camera back at the original code, or switch."; meter shown |
| `verify` | "Verifying" (`tag tag--cobalt`) | "Checking SHA-256" | "All {K} packets are in. Comparing the file hash with the sender’s." | "Verifying…" (primary, `disabled`) | "Cancel" | `vf--idle`; HUD "Camera paused" | "Camera: paused"; Photo_List shown | indeterminate `progress.progress--indet` "Verifying hash"; ring 100% |
| `done` | "Complete" (`tag tag--solid`) | "File received" | "Hash verified. The file is ready to download." | "Download" (`btn btn--cobalt btn--lg btn--block`, download icon) | "Receive another" | `vf--done`: name, size, tag "SHA-256 match · {12 hex in 3 groups of 4}…" (`tag tag--cobalt`) | "Camera: paused"; Photo_List shown | ring 100% |
| `failed` | "Verification failed" (`tag tag--signal`) | "File does not match" | "The file may be incomplete or a block was misread. Nothing was saved. Scan again from the start." | "Scan again" (`btn btn--signal btn--lg btn--block`) | "Discard" | `vf--idle`; HUD "Camera paused" | "Camera: paused"; Photo_List shown | banner `callout--error`, title "Hash mismatch", text "Expected {expected}, got {actual}" (12 lowercase hex digits each, ungrouped, from `hashes`); ring `ring--bad` |

Button targets (Requirement 5, criterion 10; assumptions revised from Resolved question 28 in Resolved question 31). "New session" means a new codec Decoder.

| Phase | Primary | Secondary |
|---|---|---|
| `empty` | Start camera: request the camera, go to `ask` | Back: go to `/` |
| `ask` | Allow camera: request the camera again when no request is pending | Not now: go to `/` |
| `denied` | Try again: request the camera, go to `ask` | Back: go to `/` |
| `nocam` | Add photo of a page: open the file picker | Back: go to `/` |
| `scan` | Stop scanning: stop the camera, go to `empty` | Start over: new session, stay in `scan` |
| `repeat` | Stop scanning: stop the camera, go to `empty` | Start over: new session, go to `scan` |
| `dup` | Keep current file: go to `scan` | Switch to new: new session, go to `scan` |
| `verify` | disabled | Cancel: new session, stop the camera, go to `empty` |
| `done` | Download: download the file | Receive another: new session, go to `empty` |
| `failed` | Scan again: new session, go to `scan` with `cameraPending` (the camera was released on `failed`), then `denied` or `nocam` when the request fails | Discard: new session, go to `empty` |

## Appendix E: Error code to disposition mapping

"Phase" is a Receive_Phase (Appendix D), "state" is a Send_State (Requirement 2), "panel" is an Error_Panel kind (Appendix F). Nothing is shown as a raw code.

| Source | Code or condition | Disposition |
|---|---|---|
| App file-size cap | Sender_File size above FILE_CAP_BYTES | Send state `toolarge` (Send_View); panel `size` where the check runs outside Send_View |
| App file-size cap | Sender_File size 0 | Send state `emptyfile`; panel `empty` where the check runs outside Send_View |
| Codec ErrorCode | PAYLOAD_TOO_LARGE | Panel `size` (Encoder refusal). For a receiver stream above the cap: panel `size` with the sender-side copy, the name replaced by "This strip" and the size from `decodePacket(bytes).totalLength` (Appendix C, row C45) |
| Codec ErrorCode | TOO_MANY_BLOCKS | Same as PAYLOAD_TOO_LARGE |
| Codec ErrorCode | SESSION_MISMATCH | Phase `dup` while scanning with the camera; panel `otherfile` for an image |
| Codec ErrorCode | HASH_MISMATCH | Phase `failed` (camera path, with `hashes`); panel `hash` for an image with the camera off |
| Codec ErrorCode | BAD_CRC | Silent per Packet (normal noise): counted for the `#diag` readout; for an IMAGE whose Packets are all of this kind, panel `nocode` |
| Codec ErrorCode | BAD_HEADER | Same as BAD_CRC |
| Codec ErrorCode | UNSUPPORTED_VERSION | Panel `internal` (no dedicated board kind; Resolved question 35) |
| Codec ErrorCode | BAD_METADATA | Panel `internal` (no dedicated board kind; Resolved question 35) |
| Codec ErrorCode | INVALID_INPUT | Panel `internal` |
| Codec ErrorCode | INCOMPLETE_DECODE | Never reachable (Requirement 13, criterion 7); no copy needed |
| Codec Ignore_Reason | DUPLICATE_PACKET | Phase `repeat` for the camera (Requirement 12, criterion 22); nothing for an image; Packets_Seen increases |
| Codec Ignore_Reason | SESSION_MISMATCH | Phase `dup` for the camera; panel `otherfile` for an image; skipped counter and Packets_Seen increase |
| Codec Ignore_Reason | ALREADY_COMPLETE | Silent; Packets_Seen increases |
| Codec Ignore_Reason | DENSE_STORE_FULL | Silent; Packets_Seen increases |
| SymbolErrorCode | INVALID_INPUT | Panel `internal` |
| SymbolErrorCode | PACKET_TOO_LARGE | Panel `internal` (cannot occur at packetSize 1732) |
| SymbolErrorCode | ENCODE_FAILED | Panel `internal` |
| SymbolErrorCode | UNSUPPORTED_ENVIRONMENT | Panel `internal` (worker, canvas or WebAssembly unavailable) |
| DecodeOutcome | found, found_many | Push every Packet (Requirement 12, criterion 5) |
| DecodeOutcome | not_found, not_strip_packet, dropped | Silent for the camera; for an IMAGE with no Packet obtained: panel `nocode` |
| Image | The browser cannot decode the file as an image | Panel `imgread` |
| Image | File larger than IMAGE_MAX_FILE_BYTES | Panel `imgbig` |
| Image | IMAGE_MAX_COUNT images already in the Photo_List | Panel `imgmany` |
| Image | No Packet obtained from the image | Panel `nocode` |
| Camera | `navigator.mediaDevices` or `getUserMedia` absent | Panel `camera` (verbatim) |
| Camera | `NotAllowedError`, `SecurityError` | Phase `denied` |
| Camera | `NotFoundError`, `NotReadableError`, `OverconstrainedError`, `AbortError` | Phase `nocam` (text "No camera found") |
| App timer | No `found` outcome for NOTHING_TIMEOUT_MS with the camera on | Panel `nothing` |
| App timer | No new solved block for STALL_TIMEOUT_MS after the first accepted Packet | Panel `stall` |
| App | Any other exception | Panel `internal` |

## Appendix F: Verbatim copy of the Error_Panel kinds, the Send_States and the Stream_Modes

All strings come from ErrorState.dc.html, Send.dc.html and SendScreen.dc.html. Parts in braces are computed. Every `Error_Panel` has `section.strip.err[role="alert"]`, `span.tag.tag--signal` with the tag text, `h2.t-h2` with the title, `p` with the message, `dl.kv` with the rows, and `div.err__actions` with `a.btn.btn--primary.btn--lg.btn--block` (primary) and `a.btn.btn--block` (secondary).

### F.1 Error_Panel kinds

| Kind | Icon | Tag | Title | Message | Rows | Primary (href) | Secondary (href) |
|---|---|---|---|---|---|---|---|
| `size` | file | "File too large" | "This file is too big for Strip" | "{name} is {size}. Strip carries files up to {cap} KB. Compress it, or split it into smaller files." | File {name}; Size {size}; Limit "{cap} KB"; `progress--signal` "File size is over the limit" with ends "{cap} KB limit" and "{size} file" | "Choose another file" (`/send`) | "About limits" (`/about#limits`) |
| `empty` | file | "Empty file" | "This file has no content" | "{name} is 0 bytes, so there is nothing to send." | File {name}; Size "0 bytes" | "Choose another file" (`/send`) | "Back to home" (`/`) |
| `imgread` | file | "Image unreadable" | "We couldn’t read this image" | "The file is not an image this browser can open, or it is damaged." | File {name} | "Choose another photo" (`/receive`, opens the file picker) | "Use the camera" (`/receive`) |
| `imgbig` | file | "Image too large" | "This image is too large" | "{name} is {size}, and photos up to {limit} can be read." | File {name}; Size {size}; Limit {limit} | "Choose a smaller photo" (`/receive`, opens the file picker) | "Use the camera" (`/receive`) |
| `imgmany` | alert | "Too many images" | "You have added the most photos allowed" | "Remove a photo to add another, or scan the remaining pages with the camera." | Photos "{count} / {IMAGE_MAX_COUNT}"; Pages needed "{N}" | "Review added photos" (`/receive`, scrolls to the Photo_List) | "Use the camera" (`/receive`) |
| `nocode` | alert | "No code found" | "No code found in this image" | "Retake the photo flat, in good light, with the whole page in frame." | File {name}; Symbols found "0" | "Try another photo" (`/receive`, opens the file picker) | "Use the camera" (`/receive`) |
| `denied` | camera | "Camera blocked" | "Camera access was denied" | "Allow the camera for this site in your browser settings, then try again." | none | "Try again" (`/receive`, requests the camera) | "Add photo of a page" (`/receive`, opens the file picker) |
| `nocamera` | camera | "No camera found" | "No camera on this device" | "You can still receive by adding photos or scans of the printed pages." | none | "Add photo of a page" (`/receive`, opens the file picker) | "Back to home" (`/`) |
| `nothing` | clock | "Camera stalled" | "Nothing readable for a while" | "No symbol has been read for {NOTHING_TIMEOUT_MS / 1000} seconds, so steady the phone, add light, or move closer." | Last symbol "{s} s ago"; Distance "Aim for 30–50 cm" | "Keep scanning" (`/receive`) | "Add photo of a page" (`/receive`, opens the file picker) |
| `otherfile` | alert | "Different file" | "These pages belong to a different file" | "Pages from two sessions can’t be combined, so keep one set and start over with the other." | Current session {B}; Other session {A} | "Start over" (`/receive`) | "Keep current file" (`/receive`) |
| `hash` | alert | "Verification failed" | "The file did not verify" | "The rebuilt file doesn’t match the sender’s hash, so nothing was saved." | Expected {expected}; Got {actual} | "Scan again" (`/receive`; new session, goes to `empty`) | "Discard" (`/`) |
| `internal` | alert | "Something went wrong" | "Something went wrong inside Strip" | "The app hit an unexpected error and stopped, so reload the page and try again." | none | "Reload" (`/`, reloads the document) | "Back to home" (`/`) |
| `camera` | camera | "Camera unavailable" | "This browser can’t use the camera" | "Receive needs the camera API, which is missing here. Open Strip in a current browser over HTTPS, ideally on a phone. Sending still works from this device." | Camera API "Missing"; Secure context "Yes (HTTPS)"; Send "Available" | "Open Send" (`/send`) | "Copy page link" (copies the URL) |
| `stall` | clock | "Decode stalled" | "No progress for {STALL_TIMEOUT_MS / 1000} seconds" | "{solved} of {total} blocks are solved. The remaining blocks need packets the camera has not read cleanly yet." | ring `ring--sm ring--dim` "{pct} percent solved" with "Frozen at {solved} / {total}"; Blocks solved "{solved} / {total}"; Packets seen "{seen}"; Last new block "{s} s ago"; tips "Move to 30–50 cm from the screen.", "Raise the sender’s brightness.", "Ask the sender to drop to 4–6 fps." | "Keep scanning" (`/receive`) | "Start over" (`/receive`) |

Board instance values, used only as fixtures: `size` "big-report.pdf", "1.4 MB", "256 KB"; `empty` "empty.txt"; `imgread` "IMG_2041.heic"; `imgbig` "IMG_2041.jpg", "28 MB", "20 MB"; `imgmany` "24 / 24", "17"; `nocode` "IMG_2043.jpg"; `nothing` "32 s ago"; `otherfile` "7F3A", "4C21"; `hash` "a1b2c3d4e5f6", "9f8e7d6c5b4a"; `stall` 82 of 111, 74, 143, "21 s ago".

### F.2 Send_States (Send.dc.html)

| Send_State | Drop class | File card | Callout | Output and action |
|---|---|---|---|---|
| `chosen` | none | `filecard`: name, MIME type, rows Size, SHA-256, Encoded, Within limit, `progress` (Requirement 2, criterion 4) | none | fieldset enabled, `screen` checked; action "Continue to Screen" (link) |
| `empty` | none | `filecard filecard--empty`: "No file chosen", "Name, size and SHA-256 appear here once you pick a file." | none | fieldset `disabled`; action `button` "Continue to Screen" `disabled` |
| `toolarge` | `drop--error` | `filecard filecard--bad`: name, type, Size "{size} ({bytes} bytes)", SHA-256 "Not computed", Within limit "No, over by {over}", `progress--signal` 100 of 100 | `callout--error` role "alert": "File too large", "{name} is {size}. Strip carries files up to {cap} KB, so compress it or split it into smaller files." | as `empty` |
| `emptyfile` | `drop--error` | `filecard filecard--bad`: name, type, Size "0 bytes", SHA-256 "Not computed", Within limit "n/a", `progress--signal` 0 of {cap} | `callout--error` role "alert": "File is empty", "{name} has no content, so there is nothing to send. Choose a file with data in it." | as `empty` |

### F.3 Stream_Modes (SendScreen.dc.html)

| Stream_Mode | Mode tag (class) | Transport label | Mode note | Previous and Next | Speed | Notice button |
|---|---|---|---|---|---|---|
| `play` | "Playing" (`tag--cobalt`) | "Pause" | "Playing at {fps} fps. Pause to step by hand." | `disabled` | enabled | "Switch to step mode" |
| `paused` | "Paused" (`tag--signal`) | "Play" | "Paused. Previous and Next step one packet." | enabled | enabled | "Switch to step mode" |
| `step` | "Step mode" (`tag--solid`) | "Play" | "Step mode: the code changes only when you press Next or Previous." | enabled | `disabled` | "Back to playback" |

Photosensitivity_Notice (every mode): `callout callout--warn` with `role="note"`, title "Flashing content", "This view flashes. Use step mode if flashing is a problem for you.", muted "Step mode is the default when your system asks for reduced motion.". Full_Screen_State: link "Exit full screen", meta "Packet {n} of {K} + repair · Lap {L} · {fps} fps".

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
10. **File cap and paper warning.** FILE_CAP_BYTES is 262,144 bytes (256 KB); the verbatim copy stays. Evidence: at packetSize 1732 a 256 KB file is K = 155, T = 200, 23 pages on the 9-per-page grid, a 25.0 s lap at 8 fps; the codec limits (32 MiB, 16384 blocks, 1024 Gaussian blocks) are far above it. The paper shows a warning above PAPER_WARN_BYTES = 65,536 (64 KB), where T = 67 and N = 8; the warning copy is derived and listed in Requirement 9, criterion 8; it is still not in the design (Appendix C, row C29). Decided by the user.
11. **Pages with many symbols.** Multi-symbol decoding is REQUIRED, for photos and scans of printed pages and for the live camera seeing a printed page. Evidence: a page holds 9 symbols on the board grid. The capability exists (dependency D2, done): `maxSymbols` and `found_many`. The acceptance target stays: the page-photo end-to-end path feeds page images with all 9 symbols per page and the file is rebuilt byte-identical. Decided by the user.
12. **Image intake limits.** One image at a time; images whose long side exceeds 4096 pixels are resized so the long side is 4096; at most IMAGE_MAX_COUNT = 24 images per session; at most IMAGE_MAX_FILE_BYTES = 20,971,520 bytes (20 MB) per file (revised by Resolved question 32). Evidence: a 12 MP photo is 48 MB as RGBA; a 4000 px photo of an A4 page gives about 7.7 px per module on the board grid. The Decode_Worker photo mode takes a 4096 × 4096 maximum; the camera keeps 1920 × 1080. Decided by the user. Revised by Resolved question 32.
13. **Screen symbol version.** Version 30 stays for the screen path. Evidence: 145 modules with the quiet zone; Small, Medium and Large give 2.62, 3.86 and 5.24 CSS px per module; at 70% of the short side of the frame, 720p gives about 3.5 camera px per module and 1080p about 5.2. The real-device check (`docs/device-test.md`) decides later whether to move the default. Decided by the user.
14. **Printed layout and Letter.** The board 9-per-page 3 × 3 grid stays (about 58.8 mm per code on A4, 0.405 mm per module, 4.8 dots at 300 dpi; about 60.5 mm on Letter). Revised by design export 2: Letter paper is selected by the Stylesheet only (named pages `@page a4` and `@page letter`, `.paper--letter` and `.two--side:has(#paper-letter:checked) .paper`); the CSSOM mechanism that the user approved for export 1 is superseded and no longer needed (Requirement 10, criterion 10). Superseded by the updated design; the user's earlier approval concerned a gap that no longer exists.
15. **Design additions.** Revised by design export 2. The following earlier approved additions are now in the design and are replaced by the design's own markup and copy: add images on Receive (`.capture`, `.picker`, Photo_List), the Play label, Previous, Next and full-screen controls on Stream_View, manual Step_Mode, the empty state on Send, the notices link (Home footer and About), the session id in the printed header and the Session row, Letter handling, the no-camera phase, the Photosensitivity_Notice, the `body { margin: 0 }` rule, and the Home specimen as a Symbol board. The following stay App additions because the design lacks them: the camera `<video>` and canvas in the viewfinder, the drag-over state (none added), the `#diag` readout, the paper warning (`data-addition`), "Continue to Paper", the derived copy formats (singular forms, size rounding, route titles), and the sheet-hiding and ring tick rules of the Additions_Stylesheet. The board `svg.code` structure is produced by the Symbol_Component from the SymbolMatrix (the earlier plan to extract `d` from `renderToSvg` is superseded). Each addition is listed in the task report. Decided by the user for export 1 and revised here.
16. **Copy for codes without a board message.** Revised by design export 2: the 14 Error_Panel kinds of the design replace the kinds drafted for export 1 (`format`, `filename`, `draw`, `reader`, `unexpected`, `limit`, and the drafted `nocamera` copy). Codes that have no board kind map to `internal` (Appendix E); UNSUPPORTED_VERSION and BAD_METADATA map to `internal` (Resolved question 35). The camera fault stays fixed: "Camera API: Missing" only for a missing camera API (kind `camera`), and NotFoundError, NotReadableError, OverconstrainedError and AbortError show "No camera found" (`nocam` phase). The earlier drafted proposals are dropped. Decided by the user for export 1 and revised here.
17. **Stylesheet and additions.** `strip.css` stays byte-identical to `design/project/strip.css`, proved by a unit test that compares the SHA-256 of the shipped copy with the design file and with the pinned constant (`tools/design.test.ts` pins `e8d66a6a…d6d37` for the design file). The `@font-face` rules go in the Fonts_Stylesheet (`fonts.css`) and the few remaining App rules in the Additions_Stylesheet (`strip-additions.css`): two sibling files. Decided by the user; the Additions_Stylesheet now holds only the rules of Requirement 19, criterion 8.
18. **Hash mismatch digests.** A HASH_MISMATCH rejection carries the first 12 hex digits of the expected and of the actual SHA-256 (`hashes.expected`, `hashes.actual`); the `failed` banner shows "Expected {expected}, got {actual}" in the design's ungrouped form. Done (dependency D1). Decided by the user.
19. **Session short form.** The first 4 uppercase hex digits of the 32-bit Session_Id (the board shows 4), or 8 digits when two forms in view would be equal; the printed header uses the 4-digit form. Decided by the user.
20. **App CSP and headers.** The App_CSP equals the symbols `STRIP_CSP`, which already includes `worker-src 'self'`: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. The App also sends `Permissions-Policy: camera=(self)`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`. Dependency D3 is done. Decided by the user.
21. **Routes.** `/`, `/send`, `/send/screen`, `/send/paper`, `/receive`, `/about`. The galleries (Errors, ErrorsAll, ReceiveStates and the state boards with their props) are Harness_Build routes only (`/__gallery/*`) and absent from the production bundle. Unknown paths go to `/`. Letter, the Send_States, the Stream_Modes and the Full_Screen_State are states of the same Routes. Decided by the user.
22. **Fidelity baseline source.** `support.js` is now in the repository (design export 2, 188,749 bytes). It is a test-only Baseline asset, never shipped and excluded from lint. No custom renderer is written. The Baseline uses the fixture "field-notes-2026.pdf" of 188,416 bytes so the size text equals the board. No board requests the CDN libraries, so no vendoring is needed; a test fails if `support.js` requests `cdn.jsdelivr.net`. Precondition P1 is met.
23. **Repository URL.** REPO_URL is `https://github.com/alwayskumar-global/strip`, used for the three GitHub links (Home footer, About footer, About credits button) as navigations with `rel="noopener"` only; design export 2 contains the real URL in all three places. Decided by the user.
24. **Dependencies.** Approved: `react`, `react-dom`, `@types/react` and `@types/react-dom`, each pinned exactly with its row in `docs/dependencies.md` in the task that adds it. The router and the service worker are hand-written (no router library, no Workbox); Vite's own JSX transform is used and `@vitejs/plugin-react` is not approved; there is no DOM-emulation test library. Decided by the user. The React version is Resolved question 37.
25. **PWA decisions.** The update policy is that a new worker waits and takes over when all windows close; icons (192, 512 and maskable 512) derive from the brand mark of the boards; `background_color` and `theme_color` are `#F7F5EF` (`--paper-50`); the `.wasm` is precached at install, because offline needs it. Decided by the user, as proposed.
26. **First-load budget.** At most 400 KB gzip for the assets the first visit to `/` loads, excluding the 946,598-byte `.wasm` and the decode worker; revisited after the first Bundle_Report. Evidence: `strip.css` is about 36.7 KB raw and the fonts are the largest line. Decided by the user.
27. **Stream details.** A lap is T Packets at the default speed; the stream continues with further repair Packets from `next()`; the counter continues past K while the progress bar stops at K (Requirement 11, criterion 17). The Send-on-screen view shows the Photosensitivity_Notice, and `prefers-reduced-motion` makes the stream default to Step_Mode, so it does not auto-play (Requirement 11, criterion 8). Revised by design export 2: the notice copy is the design's own ("Flashing content", "This view flashes. Use step mode if flashing is a problem for you."), which supersedes the copy drafted for export 1 ("Flashing image …"). Decided by the user; copy superseded.
28. **Receive behaviour not in the boards.** Stall applies only after the first accepted Packet; `verify` is shown only if a push is pending for more than 100 ms (hashing 256 KB takes a few milliseconds); `dup` is left when a Packet of the current session is accepted; the camera is released on `verify`, `done` and `failed`. Revised by design export 2: `empty` replaces `ask` as the first phase, and Stop scanning, Cancel, Receive another and Discard return to `empty` (Appendix D); see Resolved question 31. Decided by the user, as proposed, and revised.
29. **Device-check readout.** The `#diag` readout is in the production bundle, with a minimal text readout, so the real HTTPS host and CSP can be checked on a phone (Requirement 12, criterion 18). Decided by the user, as proposed.
30. **Zod and the CSP.** The App does not use `zod` in v1, because its eval probe is reported by a strict CSP; the few App inputs are validated by hand, as the codec and symbols do (Requirement 22, criterion 6). Decided by the user, as proposed.
31. **Design export 2 aligned.** The design export in `design/project` was replaced by a new Claude Design export (commit `a62af1c`: 34 boards, `support.js`, changed `strip.css`). This spec follows it: the earlier "minimal additions" are replaced wherever the design now has them (Resolved question 15), the Letter CSSOM mechanism is superseded (Resolved question 14), the photosensitivity notice copy is the design's (Resolved question 27), the 14 Error_Panel kinds and the 10 Receive_Phases are the design's (Resolved question 16), numeric limits are unchanged (Resolved questions 10, 12), and the derived rules in Appendix C (rows C29 to C47) are listed for confirmation. Recorded by the spec author, not a user decision.
32. **Image caps.** IMAGE_MAX_FILE_BYTES is 20,971,520 bytes (20 MB, replaces 25 MB) and IMAGE_MAX_COUNT is 24 (replaces 100); the copy templates keep the board wording ("photos up to 20 MB can be read", "n / 24"). The long side limit is 4096 pixels and replaces the 16.8 MP rule: a larger image is resized so that its long side is 4096. Decided by the user.
33. **Pages needed.** The codec gets a new export `pageRepairCount(K)`, the number of repair Packets `page()` adds for K blocks (the same R(K) the encoder uses). The App computes T = K + `pageRepairCount(K)` for display without encoding. Codec spec: requirement R9.1 lists ten runtime symbols, design and tasks (Group 8) are amended; goldens and wire format are untouched. Decided by the user.
34. **Ring ticks.** The App computes the tick pattern from K and sets `stroke-dasharray` on `.ring__track` and `.ring__bar` through the CSSOM (React `style` prop on the SVG elements, allowed under the CSP): tick = 2π × 44 / K with the board's 0.723 : 0.277 dash and gap ratio. `strip.css` is untouched. Decided by the user.
35. **Kinds for UNSUPPORTED_VERSION and BAD_METADATA.** Both map to the `internal` kind; no new board kinds are added and the earlier proposals are dropped. Decided by the user.
36. **Paper warning above 64 KB.** The warning is approved as a derived addition (`data-addition`, excluded from the fidelity diff) with the drafted copy. Decided by the user.
37. **React version.** React is the latest 19.x, exact-pinned: `react` and `react-dom` at the same version, `@types/react` and `@types/react-dom` at 19.x exact versions. The exact versions are chosen in the first dependency task and recorded in `docs/dependencies.md`. There is no jsdom, and the router and the service worker are hand-written. Decided by the user.
38. **Thresholds.** The minimum printed code width of 49.2 mm (Requirement 10, criterion 9) and the median tick work of at most 33 ms (Requirement 11, criterion 16) are adopted as recommended, are no longer PROPOSED, and are both tested. Decided by the user.
39. **Lap length.** The App shows the real lap of T Packets (K source plus repair; the counter continues past T), so the Send choice line shows T / FPS_DEFAULT seconds. This is a deliberate deviation from the board text "≈ 14 s loop at 8 fps", which shows K / fps; the deviation is listed in the task report. Decided by the user.
40. **Panel and state overlap.** The rule of Appendix C row C39 is a requirement (Requirement 13, criterion 11): the in-view state where the view is mounted, the Error_Panel kind for the Image_Intake with the camera off and for paths outside the view. Decided by the user.
41. **Review amendments.** The user approved 17 suggested changes: no Runtime_Libs vendoring (a test fails if `support.js` requests `cdn.jsdelivr.net`); `APP_CSP = STRIP_CSP`; long side at most 4096; R18.4 limited to page-initiated requests; the retained set is accepted Packets only and a foreign-session image adds no row, holds its Packets pending and "Start over" adopts them; the meter whenever total is above 0; failed "Scan again" goes to `scan` with `cameraPending` and the hash panel's "Scan again" goes to `empty`; route title "Receive"; "About limits" parity allowlist entry and deviation line; the Letter board's `paper--letter` class as a listed deviation (the App sets none); Baseline wrapper boards synthesized by the Baseline server and mobile heights from `canvas.json`; `clients.claim()` in `activate`; `apps/strip/vercel.json` with `outputDirectory` `dist/app`; "capture a bitmap" in R12.2; removal of `zod` by the lead in a separate commit (dependency D4); a 180 px `apple-touch-icon`; the Bundle_Report at `apps/strip/bundle-report.json`, gitignored. Decided by the user.

## Open questions

None yet.
