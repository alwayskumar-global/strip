import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// Task 4.1 (P57, R14.1, R14.2): manifest fields, icon sizes read from the PNG headers, equal theme-color.
const root = process.cwd();
const app = (p: string): Buffer => readFileSync(join(root, "apps/strip", p));
const png = (p: string): { w: number; h: number; sig: boolean } => {
  const b = app(p);
  return { sig: b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
interface Icon { src: string; sizes: string; type: string; purpose?: string }
const manifest = JSON.parse(app("public/manifest.webmanifest").toString("utf8")) as { name: string; short_name: string; start_url: string; scope: string; display: string; theme_color: string; background_color: string; icons: Icon[] };
describe("manifest and icons (P57)", () => {
  it("has the installable fields", () => {
    expect([manifest.name, manifest.short_name, manifest.start_url, manifest.scope, manifest.display]).toEqual(["Strip", "Strip", "/", "/", "standalone"]);
    expect(manifest.icons.some((i) => i.sizes === "192x192" && (i.purpose ?? "any") === "any")).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === "512x512" && (i.purpose ?? "any") === "any")).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
  });
  it("every icon is a PNG whose header size equals the declared size; the apple-touch-icon is 180 px", () => {
    for (const i of manifest.icons) {
      const { w, h, sig } = png(`public${i.src}`);
      expect(sig, i.src).toBe(true);
      expect(`${w}x${h}`, i.src).toBe(i.sizes);
      expect(i.type).toBe("image/png");
    }
    expect(png("public/icons/apple-touch-icon.png")).toMatchObject({ w: 180, h: 180 });
  });
  it("theme-color is #F7F5EF in index.html and in the manifest, and index.html links the manifest and icons", () => {
    const html = app("index.html").toString("utf8");
    expect(/<meta name="theme-color" content="([^"]+)"/.exec(html)?.[1]).toBe("#F7F5EF");
    expect(manifest.theme_color).toBe("#F7F5EF");
    expect(manifest.background_color).toBe("#F7F5EF");
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon" href="/icons/apple-touch-icon.png"');
    expect(html).toContain('rel="icon"');
  });
});
