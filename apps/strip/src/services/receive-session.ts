// The codec Decoder behind Receive: one object per session generation, an ordered log of the Packets it accepted
// (so a removed photo can be rebuilt away), and the mapping from codec results to the reducer's PushResult (R9.3, R12.24).
import { createDecoder, decodePacket, type Decoder } from "@strip/codec";
import { IMAGE_MAX_PHOTOS, MAX_PAYLOAD } from "../limits.js";
import { toHex } from "../state/format.js";
import type { FileResult, PushResult, Source } from "../state/receive.js";
/** Photo Packets kept in the log: at most 9 symbols per photo and IMAGE_MAX_PHOTOS photos, each at most 1,732 bytes. */
export const MAX_LOGGED_PHOTO_PACKETS = IMAGE_MAX_PHOTOS * 9;
export interface Pushed {
  result: PushResult;
  /** Session_Id of the Packet, when it parses. */
  sessionOf?: number;
}
export interface ReceiveSession {
  readonly gen: number;
  push(bytes: Uint8Array, source: Source): Promise<Pushed>;
  progress(): { solved: number; total: number; distinct: number; complete: boolean };
  result(): Promise<FileResult & { bytes: Uint8Array }>;
  /** A new session fed, in order, with every logged Packet whose source is not `photo`. */
  rebuildWithout(photo: number, gen: number): Promise<ReceiveSession>;
  /** Packets of the photos, by id, accepted so far (used to detect which source a Packet came from). */
  sources(): Source[];
  /** Number of logged Packets of photos (for the bound test). */
  photoLogSize(): number;
}
const same = (a: Source, b: Source): boolean => (a === "camera" ? b === "camera" : b !== "camera" && a.photo === b.photo);
const sessionIdOf = (bytes: Uint8Array): number | undefined => {
  try {
    return decodePacket(bytes, { maxPayloadBytes: MAX_PAYLOAD }).sessionId;
  } catch {
    return undefined;
  }
};
export function createReceiveSession(gen: number): ReceiveSession {
  const decoder: Decoder = createDecoder({ maxPayloadBytes: MAX_PAYLOAD });
  let photoEntries = 0;
  const log: Array<{ bytes: Uint8Array; source: Source }> = [];
  const self: ReceiveSession = {
    gen,
    async push(bytes, source) {
      const sessionOf = sessionIdOf(bytes);
      const st = await decoder.push(bytes);
      const out = (result: PushResult): Pushed => (sessionOf === undefined ? { result } : { result, sessionOf });
      if (st.kind === "accepted") {
        log.push({ bytes: bytes.slice(), source });
        if (source !== "camera") photoEntries++;
        const p = st.progress;
        return out({ k: "accepted", counters: { solved: p.solvedBlocks, total: p.totalBlocks, distinct: p.distinctPackets, complete: p.complete } });
      }
      if (st.kind === "ignored") {
        // Ignored Packets of a photo stay in the log, tagged with their photo, so that removing another photo rebuilds exactly
        // (Resolved question 43). Foreign-session Packets are never logged; camera duplicates are not kept (the log is bounded).
        if (source !== "camera" && st.reason !== "SESSION_MISMATCH" && photoEntries < MAX_LOGGED_PHOTO_PACKETS) {
          log.push({ bytes: bytes.slice(), source });
          photoEntries++;
        }
      }
      if (st.kind === "ignored") return out({ k: "ignored", reason: st.reason as "DUPLICATE_PACKET" | "SESSION_MISMATCH" | "ALREADY_COMPLETE" | "DENSE_STORE_FULL", ...(sessionOf === undefined ? {} : { foreign: sessionOf }) });
      let totalLength: number | undefined;
      try {
        totalLength = decodePacket(bytes).totalLength;
      } catch {
        /* a Packet that does not parse has no length */
      }
      return out({ k: "rejected", code: st.code, ...(st.hashes ? { hashes: { expected: st.hashes.expected, actual: st.hashes.actual } } : {}), ...(totalLength === undefined ? {} : { totalLength }) });
    },
    progress() {
      const p = decoder.progress();
      return { solved: p.solvedBlocks, total: p.totalBlocks, distinct: p.distinctPackets, complete: p.complete };
    },
    async result() {
      const r = decoder.result();
      return { name: r.metadata.name, mime: r.metadata.mime, size: r.payload.length, hash12: toHex(r.metadata.sha256).slice(0, 12), bytes: r.payload };
    },
    async rebuildWithout(photo, nextGen) {
      const kept = log.filter((e) => !same(e.source, { photo }));
      const next = createReceiveSession(nextGen);
      for (const e of kept) await next.push(e.bytes, e.source);
      return next;
    },
    sources: () => log.map((e) => e.source),
    photoLogSize: () => photoEntries,
  };
  return self;
}
