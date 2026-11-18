import { expect, test, type Page } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { H, W, rgbaToI420, writeY4M } from "./support/y4m.js";
// The screen round trip (P48, R21.3): the sender plays a file on screen, each stage capture becomes a frame of the fake camera
// (Y4M, looped by Chromium), and the receiver starts the real camera path: getUserMedia, createImageBitmap(video), the worker,
// the codec. The download must be byte-identical.
const payload = (n: number): Buffer => Buffer.from(Uint8Array.from({ length: n }, (_, i) => (i * 131 + 7 + (i >> 8) * 5) & 255));
/** PNG of the stage code, placed 1:1 on a white W x H canvas, as RGBA. */
async function pngToRgba(page: Page, png: Buffer): Promise<Uint8Array> {
  const b64 = await page.evaluate(
    async ([data, w, h]) => {
      const bin = atob(data as string);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const c = new OffscreenCanvas(w as number, h as number);
      const ctx = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w as number, h as number);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bmp, Math.floor(((w as number) - bmp.width) / 2), Math.floor(((h as number) - bmp.height) / 2));
      const d = ctx.getImageData(0, 0, w as number, h as number).data;
      let s = "";
      for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
      return btoa(s);
    },
    [png.toString("base64"), W, H] as const,
  );
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
for (const size of [6000, 40_000]) test(`P48 screen round trip (${size} bytes): stage captures through the fake camera rebuild a byte-identical file`, async ({ browser }) => {
  test.setTimeout(400_000);
  const name = "screen-notes.pdf";
  const mime = "application/pdf";
  const bytes = payload(size);
  // Sender: step mode (reduced motion), one capture per Packet of one lap.
  const sctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  const sender = await sctx.newPage();
  await sender.goto("/send");
  await sender.setInputFiles("#file", { name, mimeType: mime, buffer: bytes });
  await expect(sender.locator(".filecard__name")).toHaveText(name, { timeout: 30_000 });
  const m = /(\d+) packets · (\d+) symbols/.exec(await sender.locator(".kv__row", { hasText: "Encoded" }).locator("dd").innerText());
  const K = Number(m?.[1]);
  const T = Number(m?.[2]);
  await sender.getByRole("link", { name: /Continue to Screen/ }).click();
  await expect(sender.locator(".tag--solid")).toHaveText("Step mode");
  const frames: Uint8Array[] = [];
  const t0 = Date.now();
  for (let i = 1; i <= T; i++) {
    await expect(sender.locator(".counter__n")).toHaveText(String(i));
    const png = await sender.locator(".stage__code").screenshot();
    frames.push(rgbaToI420(await pngToRgba(sender, png)));
    if (i < T) await sender.getByRole("button", { name: /^Next/ }).click();
  }
  const t1 = Date.now();
  mkdirSync("test-results/fake-camera", { recursive: true });
  const FPS = 5;
  writeY4M(frames, FPS);
  await sctx.close();
  // Receiver: the real camera path against the fake device.
  const rctx = await browser.newContext({ permissions: ["camera"] });
  const rx = await rctx.newPage();
  await rx.addInitScript(() => {
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b: Blob | MediaSource): string => ((window as unknown as { __blobType: string }).__blobType = (b as Blob).type, orig(b));
  });
  await rx.goto("/receive");
  const t2 = Date.now();
  await rx.getByRole("button", { name: "Start camera" }).click();
  await expect(rx.locator(".rx__status h2")).toHaveText("File received", { timeout: 120_000 });
  const t3 = Date.now();
  const seen = Number(await rx.locator(".stat__v").first().innerText());
  const [download] = await Promise.all([rx.waitForEvent("download"), rx.getByRole("button", { name: /^Download/ }).click()]);
  expect(download.suggestedFilename()).toBe(name);
  expect(Buffer.compare(readFileSync(await download.path()), bytes)).toBe(0);
  expect(await rx.evaluate(() => (window as unknown as { __blobType: string }).__blobType)).toBe(mime);
  const row = { bytes: bytes.length, K, T, framesInLoop: T, fps: FPS, framesCaptured: T, framesDecodedToComplete: seen, lapsNeeded: Number((seen / T).toFixed(2)), captureMs: t1 - t0, receiveMs: t3 - t2, mode: "fake camera (y4m file)" };
  console.log(`SCREEN_ROUNDTRIP ${JSON.stringify(row)}`);
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/screen-roundtrip.json", JSON.stringify(row, null, 1));
});
