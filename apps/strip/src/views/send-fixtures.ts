// Board instance values of the Send boards (design: Per-target fixtures). Harness-only.
import type { BadFacts, FileFacts, SendStage } from "./send-vm.js";
export const FILE_FACTS: FileFacts = {
  name: "field-notes-2026.pdf",
  mime: "application/pdf",
  size: "184 KB",
  bytes: "188,416 bytes",
  hash: ["a1b2", "c3d4", "e5f6"],
  encoded: "111 packets · 149 symbols",
  within: "184 of 256 KB",
  value: 184,
  max: 256,
  screenNote: "111 packets + repair · ≈ 14 s loop at 8 fps",
  paperNote: "149 symbols · 17 pages · black on white",
};
export const BAD_FACTS: Record<"toolarge" | "emptyfile", BadFacts> = {
  toolarge: {
    name: "big-report.pdf",
    type: "application/pdf",
    size: "1.4 MB (1,468,006 bytes)",
    limit: "No, over by 1.2 MB",
    value: 100,
    max: 100,
    title: "File too large",
    msg: "big-report.pdf is 1.4 MB. Strip carries files up to 256 KB, so compress it or split it into smaller files.",
  },
  emptyfile: {
    name: "empty.txt",
    type: "text/plain",
    size: "0 bytes",
    limit: "n/a",
    value: 0,
    max: 256,
    title: "File is empty",
    msg: "empty.txt has no content, so there is nothing to send. Choose a file with data in it.",
  },
};
export const isSendStage = (s: string | null): s is SendStage => s === "chosen" || s === "empty" || s === "toolarge" || s === "emptyfile";
