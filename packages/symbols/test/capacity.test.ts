import { describe, expect, it } from "vitest";
import { QR_CAPACITY, QR_CAPACITY_BY_VERSION, QR_DEFAULTS, capacityOf, smallestVersion } from "../src/capacity.js";
import { ECC_LEVELS } from "../src/types.js";
import { ISO_CAPACITY_TABLE } from "./fixtures/iso-capacity.js";
describe("capacity table (P26, R1.4, R14.1, R14.2)", () => {
  // Feature: symbols, Property 26: QR_CAPACITY_BY_VERSION equals the ISO_Capacity_Table in all 160 cells
  it("P26: QR_CAPACITY_BY_VERSION equals the committed ISO table in all 160 cells", () => {
    expect(ISO_CAPACITY_TABLE.length).toBe(40);
    let cells = 0;
    for (let v = 1; v <= 40; v++) {
      const iso = ISO_CAPACITY_TABLE[v - 1];
      expect(iso).toBeDefined();
      ECC_LEVELS.forEach((e, i) => {
        expect(QR_CAPACITY_BY_VERSION[v]?.[e], `v${v} ${e}`).toBe(iso?.[i]);
        cells++;
      });
    }
    expect(cells).toBe(160);
    expect(Object.keys(QR_CAPACITY_BY_VERSION).length).toBe(40);
  });
  it("P26: QR_CAPACITY equals the version 40 row, and version 30 has 1732, 1370, 982, 742", () => {
    expect(QR_CAPACITY).toEqual({ L: 2953, M: 2331, Q: 1663, H: 1273 });
    expect(QR_CAPACITY_BY_VERSION[40]).toEqual(QR_CAPACITY);
    expect(QR_CAPACITY_BY_VERSION[30]).toEqual({ L: 1732, M: 1370, Q: 982, H: 742 });
  });
  it("capacity grows with version and shrinks with stronger ECC", () => {
    for (let v = 1; v <= 40; v++) {
      const r = QR_CAPACITY_BY_VERSION[v];
      expect(r && r.L > r.M && r.M > r.Q && r.Q > r.H).toBe(true);
      if (v > 1) expect(capacityOf(v, "L")).toBeGreaterThan(capacityOf(v - 1, "L"));
    }
  });
  it("R14.1: QR_DEFAULTS for screen and print are v30, L, 1732 bytes, 4 px/module, and 1732 equals the v30 L capacity", () => {
    for (const d of [QR_DEFAULTS.screen, QR_DEFAULTS.print]) {
      expect(d).toEqual({ version: 30, ecc: "L", packetSize: 1732, minPixelsPerModule: 4 });
      expect(d.packetSize).toBe(capacityOf(d.version, d.ecc));
    }
  });
  it("smallestVersion returns the smallest fitting version, or undefined above version 40", () => {
    expect(smallestVersion(1, "L")).toBe(1);
    expect(smallestVersion(17, "L")).toBe(1);
    expect(smallestVersion(18, "L")).toBe(2);
    expect(smallestVersion(1732, "L")).toBe(30);
    expect(smallestVersion(1733, "L")).toBe(31);
    expect(smallestVersion(2953, "L")).toBe(40);
    expect(smallestVersion(2954, "L")).toBeUndefined();
    expect(smallestVersion(1273, "H")).toBe(40);
    expect(smallestVersion(1274, "H")).toBeUndefined();
  });
  it("capacityOf rejects an out-of-range version", () => {
    expect(() => capacityOf(0, "L")).toThrow(RangeError);
    expect(() => capacityOf(41, "L")).toThrow(RangeError);
  });
});
