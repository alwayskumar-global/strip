import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FILE_CAP_BYTES } from "../limits.js";
import { classify, mimeOf } from "./file-rules.js";
import { CAP_KB, formatBytes, formatSize, hashChip, thousands } from "./format.js";
import { initialSendState, reduceSend, type SendStepState } from "./send-step.js";
describe("classify (P2, R2.2, R2.11, R2.12, R9.2)", () => {
  // Feature: unit (P2): emptyfile at 0, chosen for 1 to cap, toolarge above; boundaries at cap and cap + 1
  it("P2: classifies by size alone", () => {
    expect(classify(0)).toBe("emptyfile");
    expect(classify(1)).toBe("chosen");
    expect(classify(FILE_CAP_BYTES)).toBe("chosen");
    expect(classify(FILE_CAP_BYTES + 1)).toBe("toolarge");
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5_000_000 }), (n) => {
        expect(classify(n)).toBe(n === 0 ? "emptyfile" : n <= FILE_CAP_BYTES ? "chosen" : "toolarge");
      }),
    );
  });
  it("bytes are read only in chosen: only a chosen pick emits READ_AND_ENCODE", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 600_000 }), (size) => {
        const r = reduceSend(initialSendState, { t: "PICK", name: "a", type: "text/plain", size });
        expect(r.effects.some((e) => e.e === "READ_AND_ENCODE")).toBe(size >= 1 && size <= FILE_CAP_BYTES);
        expect(r.state.stage).toBe(size === 0 ? "emptyfile" : size > FILE_CAP_BYTES ? "toolarge" : "empty");
      }),
    );
  });
});
describe("mimeOf (P3, R2.14)", () => {
  it("P3: returns a valid codec MIME: the type, or application/octet-stream when empty, over 127 bytes or non-ASCII", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (t) => {
        const m = mimeOf(t);
        const ok = t !== "" && t.length <= 127 && [...t].every((c) => c.charCodeAt(0) <= 0x7f);
        expect(m).toBe(ok ? t : "application/octet-stream");
        expect(m.length).toBeLessThanOrEqual(127);
      }),
    );
    expect(mimeOf("é/x")).toBe("application/octet-stream");
    expect(mimeOf("a".repeat(127))).toBe("a".repeat(127));
    expect(mimeOf("a".repeat(128))).toBe("application/octet-stream");
  });
});
describe("format (P5, R2.3, R2.4, R2.11)", () => {
  it("matches the board examples", () => {
    expect(formatSize(188_416)).toBe("184 KB");
    expect(formatBytes(188_416)).toBe("188,416 bytes");
    expect(formatSize(1_468_006)).toBe("1.4 MB");
    expect(formatSize(1_468_006 - FILE_CAP_BYTES)).toBe("1.2 MB");
    expect(formatSize(0)).toBe("0 bytes");
    expect(CAP_KB).toBe(256);
  });
  // Feature: unit (P5): size strings parse back to the byte count within the rounding rule
  it("P5: the size text parses back within one unit of rounding", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20_000_000 }), (n) => {
        const t = formatSize(n);
        const [v, u] = t.split(" ") as [string, string];
        const back = u === "bytes" ? Number(v) : u === "KB" ? Number(v) * 1024 : Number(v) * 1_048_576;
        const unit = u === "bytes" ? 1 : u === "KB" ? 1024 : 104_858;
        expect(back).toBeGreaterThanOrEqual(n);
        expect(back - n).toBeLessThan(unit);
        expect(Number(thousands(n).replace(/,/g, ""))).toBe(n);
      }),
    );
  });
  it("hashChip splits 12 hex digits in three groups of four", () => {
    expect(hashChip("a1b2c3d4e5f6")).toEqual(["a1b2", "c3d4", "e5f6"]);
  });
});
describe("send step reducer (R2, R9)", () => {
  const pick = (s: SendStepState, size: number) => reduceSend(s, { t: "PICK", name: "f.txt", type: "", size });
  it("READ_DONE with a stale gen is ignored; the current one makes the stage chosen with output screen", () => {
    const a = pick(initialSendState, 100);
    const b = pick(a.state, 200);
    const meta = { name: "f.txt", mime: "application/octet-stream", size: 100 };
    const costs = { K: 1, T: 2, N: 1, hash12: "0".repeat(12), sessionId: 1 };
    expect(reduceSend(b.state, { t: "READ_DONE", gen: a.state.gen, meta, costs }).state.stage).toBe("empty");
    const done = reduceSend(b.state, { t: "READ_DONE", gen: b.state.gen, meta, costs }).state;
    expect(done.stage).toBe("chosen");
    expect(done.output).toBe("screen");
    expect(reduceSend(done, { t: "OUTPUT", value: "paper" }).state.output).toBe("paper");
    expect(reduceSend(done, { t: "CONTINUE" }).effects).toEqual([{ e: "NAVIGATE", to: "/send/screen" }]);
    expect(reduceSend(reduceSend(done, { t: "OUTPUT", value: "paper" }).state, { t: "CONTINUE" }).effects).toEqual([{ e: "NAVIGATE", to: "/send/paper" }]);
  });
  it("OUTPUT and CONTINUE do nothing outside chosen; REMOVE returns to empty and drops the bytes", () => {
    for (const size of [0, FILE_CAP_BYTES + 1]) {
      const s = pick(initialSendState, size).state;
      expect(reduceSend(s, { t: "OUTPUT", value: "paper" }).state).toBe(s);
      expect(reduceSend(s, { t: "CONTINUE" }).effects).toEqual([]);
      const r = reduceSend(s, { t: "REMOVE" });
      expect(r.state.stage).toBe("empty");
      expect(r.effects).toEqual([{ e: "DROP_BYTES" }]);
    }
  });
  it("a failed read maps to the empty stage with the failure panel", () => {
    const a = pick(initialSendState, 10);
    const r = reduceSend(a.state, { t: "READ_FAILED", gen: a.state.gen, meta: { name: "f.txt", mime: "text/plain", size: 10 }, panel: "size" });
    expect([r.state.stage, r.state.failure]).toEqual(["empty", "size"]);
  });
});
