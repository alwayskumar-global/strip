# Design hand-off

These rules apply to every UI task.

## Source markup

- The HTML files in `design/project/*.dc.html` and the stylesheet `design/project/strip.css` are the SOURCE markup for the application, not a visual reference. Convert them to React components keeping class names, text content, element structure and ARIA attributes.
- Do not restyle, rename classes, re-space or "improve" them. Every deviation goes in the task report with the reason.
- Copy and ARIA text come from the design verbatim.

## Stylesheet and fonts

- `strip.css` is the single stylesheet. It is copied, not rewritten. Anything the app needs beyond it is listed in the task report as an addition.
- Fonts: IBM Plex Sans and IBM Plex Mono are self-hosted (OFL woff2 under `apps/strip/public/fonts`, licence file included). No Google Fonts request anywhere, in markup or in CSS.

## Never shipped

- The mock code generator (`design/project/codegen.js`) and the design runtime (`support.js`) are never shipped. Placeholder QR content is replaced by real symbols from `@strip/symbols`.

## Template syntax

- Claude-Design template syntax (`{{ }}`, `sc-for`, `sc-if`, `dc-import`, `x-dc`, `helmet`, `data-dc-script` component classes, `hint-*` attributes) is translated to React equivalents. Each construct used is listed in the task report.

## CSP

- The CSP is strict (`style-src 'self'`, no inline style attributes in markup, no inline `<style>` blocks). Any `style=""` or inline `<style>` in the design HTML must become a class from `strip.css`, or a CSS custom property set through the CSSOM (the React `style` prop is fine). Report each one.

## Fidelity gate

- One Playwright screenshot-diff test per screen and per mobile variant, against a baseline rendered from the original design HTML in Chromium: same viewport, same self-hosted fonts through request routing. Threshold: 1% of pixels, with the QR regions masked.
- A failing diff fails the task.
