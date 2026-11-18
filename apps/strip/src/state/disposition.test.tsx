import fc from "fast-check";
import { CodecError, ERROR_CODES, type IgnoreReason } from "@strip/codec";
import { SYMBOL_ERROR_CODES } from "@strip/symbols";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { encodeFile } from "../services/paper-pages.js";
import { failurePanel } from "../services/send-session.js";
import { markupText } from "../views/board-copy.test-support.js";
import { ErrorPanel } from "../views/ErrorPanel.js";
import { ERROR_KINDS, toErrorVM } from "../views/error-vm.js";
import { CAMERA_ERROR_NAMES, ofCamera, ofCodec, ofException, ofIgnore, ofImage, ofOutcome, ofSymbol, type Origin } from "./disposition.js";
const ORIGINS: Origin[] = ["camera", "image", "encoder"];
const IGNORES = ["DUPLICATE_PACKET", "SESSION_MISMATCH", "ALREADY_COMPLETE", "DENSE_STORE_FULL"] as const satisfies readonly IgnoreReason[];
const OUTCOMES = ["found", "found_many", "not_found", "not_strip_packet", "dropped"] as const;
describe("dispositions (P27, R13.1, R13.3 to R13.7)", () => {
  // Feature: unit (P27): every member has exactly one disposition per origin and the unreachable ones are marked
  it("P27: all 10 codec codes, 4 ignore reasons, 4 symbol codes and 5 outcomes are mapped; unreachable ones are marked", () => {
    expect(ERROR_CODES).toHaveLength(10);
    expect(SYMBOL_ERROR_CODES).toHaveLength(4);
    for (const c of ERROR_CODES) for (const o of ORIGINS) expect(ofCodec(c, o, false), `${c} ${o}`).toBeDefined();
    for (const r of IGNORES) for (const o of ORIGINS) expect(ofIgnore(r, o), `${r} ${o}`).toBeDefined();
    for (const c of SYMBOL_ERROR_CODES) expect(ofSymbol(c)).toEqual({ to: "panel", kind: "internal" });
    for (const k of OUTCOMES) for (const o of ORIGINS) expect(ofOutcome(k, o)).toBeDefined();
    expect(ofCodec("INCOMPLETE_DECODE", "camera", true)).toEqual({ to: "unreachable" });
    expect(ofCodec("BAD_CRC", "camera", true)).toEqual({ to: "silent", count: "diag" });
    expect(ofCodec("HASH_MISMATCH", "camera", true)).toEqual({ to: "phase", phase: "failed" });
    expect(ofCodec("HASH_MISMATCH", "image", false)).toEqual({ to: "panel", kind: "hash" });
    expect(ofCodec("HASH_MISMATCH", "image", true)).toEqual({ to: "phase", phase: "failed" });
    expect(ofCodec("SESSION_MISMATCH", "image", false)).toEqual({ to: "panel", kind: "otherfile" });
    expect(ofCodec("PAYLOAD_TOO_LARGE", "encoder", false)).toEqual({ to: "panel", kind: "size" });
    for (const c of ["UNSUPPORTED_VERSION", "BAD_METADATA", "INVALID_INPUT"] as const) expect(ofCodec(c, "camera", false)).toEqual({ to: "panel", kind: "internal" });
    expect(ofIgnore("DUPLICATE_PACKET", "camera")).toEqual({ to: "phase", phase: "repeat" });
    expect(ofIgnore("DUPLICATE_PACKET", "image")).toEqual({ to: "silent", count: "seen" });
    expect(ofOutcome("not_found", "image")).toEqual({ to: "panel", kind: "nocode" });
    expect(ofOutcome("not_found", "camera")).toEqual({ to: "silent", count: "none" });
    expect(ofOutcome("found_many", "image")).toEqual({ to: "push" });
    expect(ofImage("unreadable")).toEqual({ to: "panel", kind: "imgread" });
    expect(ofImage("toolarge")).toEqual({ to: "panel", kind: "imgbig" });
    expect(ofImage("toomany")).toEqual({ to: "panel", kind: "imgmany" });
    expect(ofImage("nopacket")).toEqual({ to: "panel", kind: "nocode" });
    expect(ofCamera("API_MISSING")).toEqual({ to: "panel", kind: "camera" });
    for (const n of CAMERA_ERROR_NAMES) expect(ofCamera(n).to).toBe("phase");
    expect(ofCamera("NotAllowedError")).toEqual({ to: "phase", phase: "denied" });
    expect(ofCamera("NotFoundError")).toEqual({ to: "phase", phase: "nocam" });
    expect(ofCamera("SomethingElse")).toEqual({ to: "panel", kind: "camera" });
    expect(ofException()).toEqual({ to: "panel", kind: "internal" });
  });
  // Feature: unit (P28): for any error value the rendered text has no code string and no stack trace
  it("P28: no panel shows a code string, a message or a stack trace", () => {
    const codes = [...ERROR_CODES, ...SYMBOL_ERROR_CODES, ...IGNORES];
    for (const k of ERROR_KINDS) {
      const html = renderToStaticMarkup(<ErrorPanel vm={toErrorVM(k)} />);
      const text = markupText(html);
      for (const c of codes) expect(text, `${k} shows ${c}`).not.toContain(c);
      expect(text).not.toMatch(/\bat [\w.<>]+ \(|Error:|stack/i);
    }
    fc.assert(
      fc.property(fc.constantFrom(...ERROR_CODES), fc.string(), (code, message) => {
        const kind = failurePanel(new CodecError(code, message));
        const text = markupText(renderToStaticMarkup(<ErrorPanel vm={toErrorVM(kind)} />));
        expect(["size", "internal"]).toContain(kind);
        expect(text).not.toContain(code);
        if (message.trim().length > 3) expect(text).not.toContain(message.trim());
      }),
    );
  });
  // Feature: unit (P4): for any name that breaks the codec name rules the panel is internal and the name is never altered
  it("P4: a bad name is the internal panel and is never altered", async () => {
    const bad = fc.oneof(
      fc.constant(""),
      fc.constant("."),
      fc.constant(".."),
      fc.string({ maxLength: 8 }).map((s) => `${s}/x`),
      fc.string({ maxLength: 8 }).map((s) => `${s}\\x`),
      fc.string({ maxLength: 8 }).map((s) => `${s}\u0000`),
      fc.constantFrom("a\u0007b", "a\u001fb", "a\u007fb").map((s) => s),
      fc.constant("é".repeat(130)),
    );
    await fc.assert(
      fc.asyncProperty(bad, async (name) => {
        let panel: string | null = null;
        try {
          await encodeFile(new Uint8Array([1, 2, 3]), name, "text/plain");
        } catch (e) {
          panel = failurePanel(e);
        }
        expect(panel, JSON.stringify(name)).toBe("internal");
      }),
      { numRuns: 60 },
    );
  });
});
