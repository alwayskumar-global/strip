// The paper pipeline (R10): encode the Sender_File, split into pages, draw each Packet as a version-30 symbol.
import { encode, pageRepairCount, type Encoder } from "@strip/codec";
import { encodeSymbol, type SymbolMatrix } from "@strip/symbols";
import { MAX_PAYLOAD } from "../limits.js";
import { formatSize } from "../state/format.js";
import { paginate, sessionShort } from "../state/paper.js";
import type { PaperInput } from "../views/paper-vm.js";
/** One Encoder per send, packetSize 1732 (a version-30 ECC-L symbol), the codec's default limits otherwise. */
export const encodeFile = (bytes: Uint8Array, name: string, mime: string): Promise<Encoder> =>
  encode({ bytes, name, mime }, { packetSize: 1732, maxPayloadBytes: MAX_PAYLOAD });
/** T for display without encoding: K source Packets plus the codec's repair count. */
export const totalPackets = (K: number): number => K + pageRepairCount(K);
export const symbolOf = (packet: Uint8Array): SymbolMatrix => encodeSymbol(packet, { version: 30, ecc: "L" });
export interface PaperSource {
  bytes: Uint8Array;
  name: string;
  mime: string;
  hash12: string;
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
/** All T symbols arranged as pages, ready for PaperView. Yields to the event loop between pages. */
export async function buildPaperPages(src: PaperSource, enc: Encoder): Promise<{ T: number; pages: PaperInput["pages"] }> {
  const packets = enc.page();
  const T = packets.length;
  const short = sessionShort(enc.sessionId);
  const meta = `${formatSize(src.bytes.length)} · SHA-256 ${src.hash12}… · ${T} symbols`;
  const plan = paginate(T);
  const pages: PaperInput["pages"][number][] = [];
  for (const pg of plan) {
    pages.push({
      aria: `Page ${pg.page} of ${plan.length} preview`,
      name: src.name,
      meta,
      page: `Page ${pg.page} of ${plan.length}`,
      session: `Session ${short}`,
      tiles: pg.tiles.map((t) => ({ matrix: symbolOf(packets[t.index] as Uint8Array), label: t.label, of: t.of })),
    });
    if (pg.page % 2 === 0) await tick();
  }
  return { T, pages };
}
