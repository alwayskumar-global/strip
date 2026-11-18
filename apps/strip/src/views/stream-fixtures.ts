// Board instance values of the Send on screen boards (design: Per-target fixtures). Harness-only use.
import type { StreamInput, StreamMode } from "./stream-vm.js";
export const isStreamMode = (s: string | null): s is StreamMode => s === "play" || s === "paused" || s === "step";
/** The board's own numbers: packet 38 (39 in step mode), lap 2 when paused, K 111, 8 fps. */
export function streamInput(mode: StreamMode, matrix: StreamInput["matrix"], rootCls = ""): StreamInput {
  return { mode, n: mode === "step" ? 39 : 38, k: 111, lap: mode === "paused" ? 2 : 1, fps: 8, fileTag: "field-notes-2026.pdf · 184 KB", matrix, rootCls };
}
