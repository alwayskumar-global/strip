// Send step 1 state to the Send board's facts (R2.3 to R2.17, R9.8). Pure.
import { FILE_CAP_BYTES, FPS_DEFAULT, PAPER_WARN_BYTES } from "../limits.js";
import type { BadFacts, FileFacts, SendInput } from "../views/send-vm.js";
import { CAP_KB, formatBytes, formatSize, hashChip, plural, thousands } from "./format.js";
import type { SendStepState } from "./send-step.js";
export function fileFacts(name: string, mime: string, size: number, costs: { K: number; T: number; N: number; hash12: string }): FileFacts {
  const loop = Math.round(costs.T / FPS_DEFAULT); // the real lap of T Packets (deliberate deviation from the board's K / fps)
  return {
    name,
    mime,
    size: formatSize(size),
    bytes: formatBytes(size),
    hash: hashChip(costs.hash12),
    encoded: `${plural(costs.K, "packet", "packets")} · ${plural(costs.T, "symbol", "symbols")}`,
    within: `${Math.ceil(size / 1024)} of ${CAP_KB} KB`,
    value: Math.ceil(size / 1024),
    max: CAP_KB,
    screenNote: `${plural(costs.K, "packet", "packets")} + repair · ≈ ${loop} s loop at ${FPS_DEFAULT} fps`,
    paperNote: `${plural(costs.T, "symbol", "symbols")} · ${plural(costs.N, "page", "pages")} · black on white`,
  };
}
export function badFacts(name: string, mime: string, size: number): BadFacts {
  if (size === 0) {
    return { name, type: mime, size: "0 bytes", limit: "n/a", value: 0, max: CAP_KB, title: "File is empty", msg: `${name} has no content, so there is nothing to send. Choose a file with data in it.` };
  }
  return {
    name,
    type: mime,
    size: `${formatSize(size)} (${thousands(size)} bytes)`,
    limit: `No, over by ${formatSize(size - FILE_CAP_BYTES)}`,
    value: 100,
    max: 100,
    title: "File too large",
    msg: `${name} is ${formatSize(size)}. Strip carries files up to ${CAP_KB} KB, so compress it or split it into smaller files.`,
  };
}
export const paperWarning = (T: number, N: number): { title: string; text: string } => ({
  title: "Many pages",
  text: `This file needs ${N} printed pages (${T} codes). A smaller file needs fewer pages. You can also show it on screen instead.`,
});
/** The "Many pages" warning, only above PAPER_WARN_BYTES (R9.8, R9.11). */
export const paperWarnIf = (size: number, T: number, N: number): { title: string; text: string } | null => (size > PAPER_WARN_BYTES ? paperWarning(T, N) : null);
export function sendInputOf(s: SendStepState): SendInput {
  const m = s.meta;
  const input: SendInput = { stage: s.stage, output: s.output };
  if (!m) return input;
  if (s.stage === "chosen" && s.costs) {
    input.file = fileFacts(m.name, m.mime, m.size, s.costs);
    input.paperWarn = paperWarnIf(m.size, s.costs.T, s.costs.N);
  } else if (s.stage === "toolarge" || s.stage === "emptyfile") input.bad = badFacts(m.name, m.mime, m.size);
  return input;
}
