import { createDecoder, encode } from "@strip/codec";
import { describe, expect, it } from "vitest";
import { toHex } from "../state/format.js";
import { failurePanel, sendStore } from "./send-session.js";
import { CodecError } from "@strip/codec";
const until = async (f: () => boolean): Promise<void> => {
  for (let i = 0; i < 400 && !f(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(f()).toBe(true);
};
describe("send session store (P6, R2.2, R2.5, R2.6)", () => {
  it("a picked file becomes chosen; the hash chip equals the Metadata_Record hash; Remove drops the bytes", async () => {
    sendStore.reset();
    const bytes = Uint8Array.from({ length: 5000 }, (_, i) => (i * 31 + 7) & 255);
    const file = new File([bytes], "notes.bin", { type: "" });
    sendStore.dispatch({ t: "PICK", name: file.name, type: file.type, size: file.size }, file);
    expect(sendStore.getState().reading).toBe(true);
    await until(() => sendStore.getState().stage === "chosen");
    const sf = sendStore.file();
    expect(sf?.bytes).toEqual(bytes);
    expect(sf?.mime).toBe("application/octet-stream");
    // The chip equals the first 6 bytes of the hash in the Metadata_Record the codec writes.
    const enc = await encode({ bytes, name: "notes.bin", mime: "application/octet-stream" }, { packetSize: 1732 });
    const dec = createDecoder();
    for (const p of enc.page()) await dec.push(p);
    expect(toHex(dec.result().metadata.sha256).slice(0, 12)).toBe(sf?.costs.hash12);
    sendStore.dispatch({ t: "REMOVE" });
    expect(sendStore.file()).toBeNull();
    expect(sendStore.getState().stage).toBe("empty");
  });
  it("a too-large file is never read; a zero-byte file is emptyfile", () => {
    sendStore.reset();
    let reads = 0;
    const big = { name: "big.bin", type: "", size: 300_000, arrayBuffer: () => { reads++; return Promise.resolve(new ArrayBuffer(0)); } } as unknown as File;
    sendStore.dispatch({ t: "PICK", name: big.name, type: big.type, size: big.size }, big);
    expect(sendStore.getState().stage).toBe("toolarge");
    sendStore.dispatch({ t: "PICK", name: "z", type: "", size: 0 });
    expect(sendStore.getState().stage).toBe("emptyfile");
    expect(reads).toBe(0);
    expect(sendStore.file()).toBeNull();
  });
  it("a name the codec rejects is the internal panel; size errors are the size panel (R9.4, R9.7)", async () => {
    sendStore.reset();
    const file = new File([new Uint8Array([1, 2, 3])], "a/b.txt", { type: "text/plain" });
    sendStore.dispatch({ t: "PICK", name: file.name, type: file.type, size: file.size }, file);
    await until(() => !sendStore.getState().reading);
    expect([sendStore.getState().stage, sendStore.getState().failure]).toEqual(["empty", "internal"]);
    expect(failurePanel(new CodecError("PAYLOAD_TOO_LARGE", "x"))).toBe("size");
    expect(failurePanel(new CodecError("TOO_MANY_BLOCKS", "x"))).toBe("size");
    expect(failurePanel(new CodecError("BAD_METADATA", "x"))).toBe("internal");
    sendStore.reset();
  });
});
