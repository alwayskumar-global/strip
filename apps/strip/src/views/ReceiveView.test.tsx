import fc from "fast-check";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { encodeSymbol } from "@strip/symbols";
import { arc, dash, tick } from "../components/Ring.js";
import { attrValues, boardAriaLabels, boardTexts, markupText } from "./board-copy.test-support.js";
import { ReceiveView } from "./ReceiveView.js";
import { receiveInput } from "./receive-fixtures.js";
import { RECEIVE_PHASES, toReceiveVM, type ReceivePhase } from "./receive-vm.js";
const matrix = encodeSymbol(Uint8Array.from({ length: 1700 }, (_, i) => (i * 13) & 255), { version: 30, ecc: "L" });
const vmOf = (p: ReceivePhase) => toReceiveVM(receiveInput(p, matrix));
const html = (p: ReceivePhase): string => renderToStaticMarkup(<ReceiveView vm={vmOf(p)} />);
const BOARD_TAGS: Record<ReceivePhase, string> = { empty: "Ready", ask: "Waiting for permission", denied: "Camera blocked", nocam: "No camera", scan: "Scanning", repeat: "Duplicate frame", dup: "Other session", verify: "Verifying", done: "Complete", failed: "Verification failed" };
describe("ReceiveView and toReceiveVM (P32, R5.1 to R5.18)", () => {
  for (const phase of RECEIVE_PHASES) {
    it(`${phase}: tag, heading and the board's active static copy and ARIA text appear verbatim`, () => {
      const vm = vmOf(phase);
      const active = { showCode: vm.showCode, showMsg: vm.showMsg, showDone: vm.showDone, showHud: vm.showHud, hasPhotos: vm.hasPhotos, noPhotos: vm.noPhotos, isDenied: vm.isDenied, hasBanner: vm.hasBanner, showBar: vm.showBar, isVerify: vm.isVerify, isNocam: vm.isNocam, hasPrimaryBtn: vm.hasPrimaryBtn, isDone: vm.isDone, showTorch: vm.showTorch, camOn: vm.camOn, camOff: vm.camOff };
      const out = html(phase);
      const text = markupText(out);
      expect(text).toContain(BOARD_TAGS[phase]);
      for (const t of boardTexts("ReceiveState.dc.html", active)) expect(text, t).toContain(t);
      const labels = attrValues(out, "aria-label");
      for (const l of boardAriaLabels("ReceiveState.dc.html", active)) expect(labels, l).toContain(l);
    });
  }
  // Feature: unit (P32): per phase and for any counters the VM equals Appendix D with computed numbers; the meter shows whenever total is above 0
  it("P32: the counters follow the inputs; the meter shows whenever total is above 0 and is an addition where the board has none", () => {
    fc.assert(
      fc.property(fc.constantFrom(...RECEIVE_PHASES), fc.nat(500), fc.nat(500), fc.nat(500), fc.integer({ min: 0, max: 300 }), (phase, seen, solved, distinct, total) => {
        const { pct: _override, ...base } = receiveInput(phase, matrix);
        void _override;
        const vm = toReceiveVM({ ...base, seen, solved, distinct, total });
        expect(vm.seen).toBe(String(seen));
        expect(vm.solved).toBe(String(solved));
        expect(vm.showBar).toBe(total > 0);
        expect(vm.distinct).toBe(Math.min(distinct, total));
        expect(vm.pct).toBe(total > 0 ? Math.floor((100 * solved) / total) : 0);
        const out = renderToStaticMarkup(<ReceiveView vm={vm} />);
        expect(out.includes('class="meter"')).toBe(total > 0);
        if (total > 0) expect(markupText(out)).toContain(`${vm.distinct} of ${total}`);
        expect(out.includes(`/ ${total}</span>`) || markupText(out).includes(`/ ${total}`)).toBe(true);
      }),
      { numRuns: 100 },
    );
    for (const phase of RECEIVE_PHASES) {
      const vm = vmOf(phase);
      expect(vm.showBar).toBe(true);
      expect(vm.barAdd).toBe(!["nocam", "scan", "repeat", "dup"].includes(phase));
      expect(html(phase).includes("data-addition")).toBe(vm.barAdd);
    }
  });
  it("the torch appears in scan, repeat and dup only; the photo hint only without photos; the primary button is disabled only in verify", () => {
    for (const p of RECEIVE_PHASES) {
      const vm = vmOf(p);
      expect(vm.showTorch).toBe(["scan", "repeat", "dup"].includes(p));
      expect(html(p).includes('aria-label="Torch"')).toBe(vm.showTorch);
      expect(vm.noPhotos).toBe(["empty", "ask", "denied"].includes(p));
      expect(vm.primaryOff).toBe(p === "verify");
      expect(vm.hasPrimaryBtn).toBe(p !== "nocam");
    }
    expect(markupText(html("nocam"))).toContain("Add photo of a page");
  });
  it("computed copy: the dup, repeat, verify and failed texts carry the inputs", () => {
    const i = receiveInput("dup", matrix);
    expect(toReceiveVM({ ...i, skipped: 3, sessionA: "AAAA", sessionB: "BBBB" }).msg).toContain("3 packets from another session");
    expect(toReceiveVM({ ...i, sessionA: "AAAA", sessionB: "BBBB" }).hud).toBe("Session AAAA ≠ BBBB");
    expect(toReceiveVM({ ...receiveInput("repeat", matrix), packetN: 7 }).hud).toBe("Packet 7 already seen");
    expect(toReceiveVM({ ...receiveInput("verify", matrix), total: 42 }).msg).toContain("All 42 packets");
    expect(toReceiveVM({ ...receiveInput("failed", matrix), expected: "aaa", got: "bbb" }).bannerMsg).toBe("Expected aaa, got bbb");
    expect(toReceiveVM({ ...receiveInput("scan", matrix), photos: [{ name: "a.png", found: 1 }] }).photoCount).toBe("1 photo · 1 symbol");
    expect(vmOf("scan").photoCount).toBe("2 photos · 18 symbols");
  });
});
describe("Ring helpers (P24, R5.9)", () => {
  // Feature: unit (P24): arc is empty at 0 and the full circle at 100; tick(K) times K equals the circumference
  it("P24: arc(0) is empty, arc(100) the full circle, and tick(K) x K is the circumference", () => {
    expect(arc(0)).toBe("");
    expect(arc(100)).toBe("M50 6A44 44 0 1 1 49.99 6");
    expect(arc(-5)).toBe("");
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 600 }), (k) => {
        expect(tick(k) * k).toBeCloseTo(2 * Math.PI * 44, 9);
        const [on, off] = dash(k).split(" ").map(Number) as [number, number];
        expect(on + off).toBeCloseTo(tick(k), 3);
      }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99 }), (p) => {
        expect(arc(p)).toMatch(/^M50 6A44 44 0 [01] 1 -?\d+(\.\d+)? -?\d+(\.\d+)?$/);
      }),
    );
  });
  it("at K = 111 the dash matches the board's 1.8 and .69", () => {
    const [on, off] = dash(111).split(" ").map(Number) as [number, number];
    expect(on).toBeCloseTo(1.8, 1);
    expect(off).toBeCloseTo(0.69, 1);
  });
});
