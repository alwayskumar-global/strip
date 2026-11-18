// Which buffers of a decode outcome move to the main thread without a copy (R16.12): the bytes of every symbol, once.
import type { DecodeOutcome } from "@strip/symbols";

export function transferListOf(outcome: DecodeOutcome): ArrayBuffer[] {
  if (outcome.kind === "found") return [outcome.bytes.buffer as ArrayBuffer];
  if (outcome.kind === "found_many") return outcome.symbols.map((s) => s.bytes.buffer as ArrayBuffer);
  return [];
}
