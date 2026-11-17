# Real-device check for symbols

Status: not yet run. Every number in `packages/symbols/README.md` comes from synthetic images. This check covers what synthetic images do not model: moire between a screen's pixel grid and the camera sensor, glare, motion blur, rolling shutter, and print defects such as ink spread and paper texture. Its result decides whether `QR_DEFAULTS` (version 30, ECC L, 1732 bytes, at least 4 pixels per module) stays or moves.

Prerequisite: a receiver page with a live camera loop that feeds frames to `createFrameDecoder` and shows, for each frame, the outcome (`found`, `not_found`, `dropped`) and the decode time. That page belongs to the app work, not to the symbols package. Camera access needs a secure context: serve over HTTPS, or over `localhost` through port forwarding to the phone (Android: `adb reverse`). Send the Strip CSP header on every response. If the page does not exist yet, stop here and build it first.

## What to show or print

1. **Screen set.** The sender page shows a looping stream of symbols at version 30, ECC L, 1732-byte packets, from a real codec file of about 50 KB. Repeat at module sizes of 4, 5 and 6 CSS pixels at device pixel ratio 1, and once more at the largest size that fits.
2. **Print set.** One A4 page per size, printed from `renderToSvg` with `mm` set to 145 modules times the module size: module sizes 0.35 mm, 0.5 mm and 0.7 mm (about 51, 73 and 101 mm wide, quiet zone included). Print each on a laser printer and on an inkjet printer, on plain 80 g paper. Add a version 40 page at 0.5 mm (about 93 mm) so the data can say whether the default should move up.
3. **Control.** The same symbols shown on a second phone screen, to compare a phone-to-phone path.

## Phones

At least three, written down with exact model and OS version:

- one mid-range Android phone from the last four years (this is the phone the 5 decodes per second target is about),
- one iPhone (Safari),
- one older or low-end phone if available.

Test each in its default camera resolution, and in 720p if the browser lets you choose.

## Conditions

For each phone and each set: distance so the symbol fills about 70% of the short side of the frame (and once at 50%), tilt of 0, 15 and 30 degrees, hand-held and steadied, and three lights: office lighting, dim room, and a window or lamp that puts glare on the screen or the paper. For screens also note the display type (LCD, OLED), refresh rate and brightness.

## What to record

One row per run, in a table kept next to the build under test:

| Field | Meaning |
|---|---|
| Date, tester, build (commit hash) | |
| Phone, OS, browser | exact versions |
| Camera and capture size | for example 1920x1080 |
| Source | screen (device, size, brightness) or print (printer, paper, module size in mm) |
| Version, ECC, module size on the source | |
| Pixels per module reached | estimated from the symbol width in the camera frame divided by the module count (145 for version 30 with quiet zone) |
| Distance, tilt, light, hand-held or steadied | |
| Frames offered, frames decoded, frames dropped | per run of at least 100 frames for screens, at least 30 scans for each print |
| Per-frame success | decoded divided by offered, excluding dropped |
| Decode time per frame | median and worst, as the receiver page reports it |
| Sustained decodes per second over 30 seconds | the target is at least 5 on the mid-range phone |
| File recovered | yes or no, and the number of packets needed |
| Notes | moire, glare, blur, anything odd, a photo of the setup |

## Reading the result

The targets mirror the requirements and are checks, not claims: per-frame success of at least 0.90 for screens and 0.97 for print at the 70% size, and at least 5 decodes per second on the mid-range phone. The synthetic runs assumed that mid-range phones are 5 to 10 times slower than the Apple M2 Pro; this check replaces that assumption with a measurement.

- If a source fails at 4 pixels per module but passes at 5 or 6, raise the minimum in `QR_DEFAULTS` and the module sizes the app uses.
- If everything passes with margin, including the version 40 print, record that and decide separately whether a larger default is worth it. The synthetic grid could not rank them.
- If decode time is the limit, record the phone and frame size and revisit the video-mode reader options.
- Whatever the outcome, record the table in the repository and update `packages/symbols/README.md`.
