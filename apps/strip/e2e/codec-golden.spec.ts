// Chromium (bundled by Playwright) against the localhost harness: Default_Hash parity with Node, the golden
// vectors from the independent Python reference, and a payload round trip. Requirements 1.11 and 9.5.
// One-time browser setup: pnpm exec playwright install chromium
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

interface GoldenCase {
  name: string;
  payloadHex: string;
  fileName: string;
  mime: string;
  packetSize: number;
  sessionId: number;
  K: number;
  blockSize: number;
  totalLength: number;
  packets: Array<{ seq: number; kind: string; hex: string }>;
}
const vectors = JSON.parse(readFileSync(`${process.cwd()}/../../packages/codec/test/golden/vectors.json`, "utf8")) as { cases: GoldenCase[] };

type Harness = {
  sha256Hex(h: string): Promise<string>;
  packets(p: string, n: string, m: string, s: number, c: number): Promise<{ sessionId: number; K: number; blockSize: number; totalLength: number; packets: string[] }>;
  roundTrip(p: string, n: string, m: string, s: number): Promise<{ complete: boolean; payloadHex: string; name: string; mime: string }>;
  decode(p: string[]): Promise<{ complete: boolean; payloadHex: string; name: string }>;
};
declare global {
  interface Window {
    __codec: Harness;
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e-harness/index.html");
  await page.waitForFunction(() => "__codec" in window);
});

test("Default_Hash gives the same digest in Chromium as in Node, including empty input (R1.11)", async ({ page }) => {
  const inputs = ["", "616263", "00", "ff".repeat(1000), Array.from({ length: 4096 }, (_, i) => ((i * 7) & 0xff).toString(16).padStart(2, "0")).join("")];
  for (const hex of inputs) {
    const browser = await page.evaluate((h) => window.__codec.sha256Hex(h), hex);
    const node = createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
    expect(browser).toBe(node);
  }
  expect(await page.evaluate(() => window.__codec.sha256Hex(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

for (const c of vectors.cases) {
  test(`golden case ${c.name}: Chromium packets are byte-identical to the reference (R9.5)`, async ({ page }) => {
    const r = await page.evaluate((a) => window.__codec.packets(a.payloadHex, a.fileName, a.mime, a.packetSize, a.count), {
      payloadHex: c.payloadHex,
      fileName: c.fileName,
      mime: c.mime,
      packetSize: c.packetSize,
      count: c.packets.length,
    });
    expect(r.sessionId).toBe(c.sessionId);
    expect(r.K).toBe(c.K);
    expect(r.blockSize).toBe(c.blockSize);
    expect(r.totalLength).toBe(c.totalLength);
    expect(r.packets.length).toBe(c.packets.length);
    c.packets.forEach((p, i) => expect(r.packets[i], `seq ${p.seq} (${p.kind})`).toBe(p.hex));
    const kinds = new Set(c.packets.map((p) => p.kind));
    expect(kinds.has("systematic") && kinds.has("sparse") && kinds.has("dense")).toBe(true);
  });

  test(`golden case ${c.name}: Chromium decodes the reference packets back to the payload`, async ({ page }) => {
    const r = await page.evaluate((a) => window.__codec.decode(a), c.packets.map((p) => p.hex));
    expect(r.complete).toBe(true);
    expect(r.payloadHex).toBe(c.payloadHex);
    expect(r.name).toBe(c.fileName);
  });
}

test("a payload round trip in Chromium with a third of the systematic packets lost", async ({ page }) => {
  const hex = Array.from({ length: 30000 }, (_, i) => ((i * 131 + 17) & 0xff).toString(16).padStart(2, "0")).join("");
  const r = await page.evaluate((h) => window.__codec.roundTrip(h, "round-trip.bin", "application/octet-stream", 2953), hex);
  expect(r.complete).toBe(true);
  expect(r.payloadHex).toBe(hex);
  expect(r.name).toBe("round-trip.bin");
  expect(r.mime).toBe("application/octet-stream");
});
