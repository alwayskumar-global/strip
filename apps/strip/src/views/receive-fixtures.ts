// Board instance values of the Receive boards (design: Per-target fixtures, Appendix D). Harness-only use.
import type { SymbolMatrix } from "@strip/symbols";
import { RECEIVE_PHASES, type ReceiveInput, type ReceivePhase } from "./receive-vm.js";
export const isReceivePhase = (s: string | null): s is ReceivePhase => (RECEIVE_PHASES as readonly string[]).includes(s ?? "");
const PHOTOS = [{ name: "IMG_2041.jpg", found: 9 }, { name: "scan-0007.png", found: 9 }];
/** seen, solved, distinct, pct (override, C6) and photos per phase, as in the board. */
const COUNTS: Record<ReceivePhase, { seen: number; solved: number; distinct: number; pct: number; photos: boolean }> = {
  empty: { seen: 0, solved: 0, distinct: 0, pct: 0, photos: false },
  ask: { seen: 0, solved: 0, distinct: 0, pct: 0, photos: false },
  denied: { seen: 0, solved: 0, distinct: 0, pct: 0, photos: false },
  nocam: { seen: 18, solved: 18, distinct: 18, pct: 16, photos: true },
  scan: { seen: 52, solved: 41, distinct: 41, pct: 37, photos: true },
  repeat: { seen: 58, solved: 41, distinct: 41, pct: 37, photos: true },
  dup: { seen: 66, solved: 41, distinct: 41, pct: 37, photos: true },
  verify: { seen: 126, solved: 111, distinct: 111, pct: 100, photos: true },
  done: { seen: 126, solved: 111, distinct: 111, pct: 100, photos: true },
  failed: { seen: 141, solved: 111, distinct: 111, pct: 100, photos: true },
};
export function receiveInput(phase: ReceivePhase, codeMatrix: SymbolMatrix): ReceiveInput {
  const c = COUNTS[phase];
  // total is 111 in every phase of the board's stats; the meter of the phases without one is an addition (data-addition).
  return {
    phase, seen: c.seen, solved: c.solved, distinct: c.distinct, total: 111, pct: c.pct, photos: c.photos ? PHOTOS : [],
    packetN: 41, skipped: 14, sessionA: "7F3A", sessionB: "4C21",
    doneName: "field-notes-2026.pdf", doneSize: "184 KB", doneHash: "a1b2 c3d4 e5f6…", expected: "a1b2c3d4e5f6", got: "9f8e7d6c5b4a", codeMatrix,
  };
}
