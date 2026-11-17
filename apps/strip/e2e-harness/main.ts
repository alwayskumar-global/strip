// Tiny harness: exposes the codec's public barrel to Playwright through window.__codec.
// Only the public barrel is imported, as for any app.
import { createDecoder, encode, sha256WebCrypto } from "@strip/codec";

const fromHex = (h: string): Uint8Array => Uint8Array.from({ length: h.length / 2 }, (_, i) => parseInt(h.slice(2 * i, 2 * i + 2), 16));
const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

const api = {
  async sha256Hex(dataHex: string): Promise<string> {
    return toHex(await sha256WebCrypto(fromHex(dataHex)));
  },
  /** The first `count` packets of the stream for a payload, as hex. */
  async packets(payloadHex: string, name: string, mime: string, packetSize: number, count: number) {
    const e = await encode({ bytes: fromHex(payloadHex), name, mime }, { packetSize });
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push(toHex(e.next()));
    return { sessionId: e.sessionId, K: e.K, blockSize: e.blockSize, totalLength: e.totalLength, packets: out };
  },
  /** Encode, drop every third systematic packet, decode from the rest plus repair packets. */
  async roundTrip(payloadHex: string, name: string, mime: string, packetSize: number) {
    const e = await encode({ bytes: fromHex(payloadHex), name, mime }, { packetSize });
    const d = createDecoder();
    for (let i = 0; i < e.K; i++) {
      const p = e.next();
      if (i % 3 !== 1) await d.push(p);
    }
    for (let i = 0; i < 4 * e.K && !d.progress().complete; i++) await d.push(e.next());
    const r = d.progress().complete ? d.result() : undefined;
    return { complete: d.progress().complete, payloadHex: r ? toHex(r.payload) : "", name: r?.metadata.name ?? "", mime: r?.metadata.mime ?? "" };
  },
  /** Decode a list of packets (hex) and return the result. */
  async decode(packetsHex: string[]) {
    const d = createDecoder();
    for (const p of packetsHex) await d.push(fromHex(p));
    const r = d.progress().complete ? d.result() : undefined;
    return { complete: d.progress().complete, payloadHex: r ? toHex(r.payload) : "", name: r?.metadata.name ?? "" };
  },
};

(window as unknown as { __codec: typeof api }).__codec = api;
