// Receive state to the Receive board's facts (R5, R12.7). Pure.
import type { ReceiveInput, ReceivePhase } from "../views/receive-vm.js";
import { formatSize, hashChip } from "./format.js";
import type { ReceiveState } from "./receive.js";
import { sessionShort } from "./paper.js";
/** Ring percent: floor(100 x solved / total), 0 while total is 0, and 100 only when complete. */
export function percentOf(solved: number, total: number, complete: boolean): number {
  if (complete) return 100;
  if (total <= 0) return 0;
  return Math.min(99, Math.floor((100 * solved) / total));
}
export function receiveInputOf(s: ReceiveState): ReceiveInput {
  const c = s.counters;
  const phase: ReceivePhase = s.phase;
  const input: ReceiveInput = {
    phase,
    seen: c.seen,
    solved: c.solved,
    distinct: c.distinct,
    total: c.total,
    pct: percentOf(c.solved, c.total, c.complete),
    photos: s.photos,
    skipped: c.skipped,
  };
  if (s.session !== undefined) input.sessionA = sessionShort(s.session);
  if (s.foreign) input.sessionB = sessionShort(s.foreign.id);
  if (s.result) {
    input.doneName = s.result.name;
    input.doneSize = formatSize(s.result.size);
    input.doneHash = `${hashChip(s.result.hash12).join(" ")}…`;
  }
  if (s.hashes) {
    input.expected = s.hashes.expected;
    input.got = s.hashes.actual;
  }
  return input;
}
