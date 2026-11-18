// The stall and nothing verdicts (design: Timers, R12.19 to R12.21). Pure: time arrives as numbers.
import { NOTHING_TIMEOUT_MS, STALL_TIMEOUT_MS } from "../limits.js";
export interface Timing {
  cameraStartedAt?: number;
  firstAcceptedAt?: number;
  lastSolvedAt?: number;
  lastFoundAt?: number;
}
/** stall: a first Packet was accepted and no new block was solved for 20 s. nothing: no `found` for 30 s. stall wins when both hold. */
export function verdict(t: Timing, now: number, cameraOn: boolean): "stall" | "nothing" | null {
  if (!cameraOn) return null;
  if (t.firstAcceptedAt !== undefined && now - (t.lastSolvedAt ?? t.firstAcceptedAt) >= STALL_TIMEOUT_MS) return "stall";
  const since = t.lastFoundAt ?? t.cameraStartedAt;
  if (since !== undefined && now - since >= NOTHING_TIMEOUT_MS) return "nothing";
  return null;
}
/** The earliest moment a verdict can become true, or null when no clock is running. */
export function nextDeadline(t: Timing): number | null {
  const ds: number[] = [];
  if (t.firstAcceptedAt !== undefined) ds.push((t.lastSolvedAt ?? t.firstAcceptedAt) + STALL_TIMEOUT_MS);
  const since = t.lastFoundAt ?? t.cameraStartedAt;
  if (since !== undefined) ds.push(since + NOTHING_TIMEOUT_MS);
  return ds.length === 0 ? null : Math.min(...ds);
}
