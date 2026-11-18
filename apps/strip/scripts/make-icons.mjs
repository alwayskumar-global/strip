// Dev-time: renders the brand mark (the design's header.nav svg) to the PWA icons with the bundled Chromium.
// Run: node scripts/make-icons.mjs. The PNGs are committed; nothing here ships. No new dependency.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const PAPER = "#F7F5EF";
const INK = "#121210";
// The board's mark: viewBox 0 0 28 28, a 22 x 24 sheet with four text lines.
const mark = (size, inset) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 28 28">
  <rect width="28" height="28" fill="${PAPER}"/>
  <g transform="translate(14 14) scale(${(1 - 2 * inset) * 0.78}) translate(-14 -14)" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="miter">
    <rect x="3" y="2" width="22" height="24"/><path d="M8 8h12M8 12h7M8 16h12M8 20h5"/>
  </g></svg>`;
const OUT = [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["icon-maskable-512.png", 512, 0.12], // the mark stays inside the maskable safe zone (the centre 80 percent)
  ["apple-touch-icon.png", 180, 0.04],
];
mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch();
for (const [file, size, inset] of OUT) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0">${mark(size, inset)}</body>`);
  await page.screenshot({ path: `public/icons/${file}`, omitBackground: false });
  await page.close();
}
await browser.close();
