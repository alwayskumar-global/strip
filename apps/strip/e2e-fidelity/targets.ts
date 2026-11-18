// The 53 fidelity targets (design.md "Fidelity harness"). Viewports are read from design/project/canvas.json at test time.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export interface Target {
  id: string;
  group: "desktop" | "mobile" | "phase" | "kind";
  /** Baseline board path on port 5184. */
  board: string;
  /** App path on port 5183 (gallery build). */
  app: string;
  width: number;
  height: number;
}
export const BASELINE_ORIGIN = "http://127.0.0.1:5184";
export const APP_ORIGIN = "http://127.0.0.1:5183";
export const RECEIVE_PHASES = ["empty", "ask", "denied", "nocam", "scan", "repeat", "dup", "verify", "done", "failed"] as const;
export const ERROR_KINDS = ["size", "empty", "imgread", "imgbig", "imgmany", "nocode", "denied", "nocamera", "nothing", "otherfile", "hash", "internal", "camera", "stall"] as const;
interface Canvas {
  boards: Record<string, { w: number; h: number }>;
}
const canvas = JSON.parse(readFileSync(fileURLToPath(new URL("../../../design/project/canvas.json", import.meta.url)), "utf8")) as Canvas;
const size = (board: string): { width: number; height: number } => {
  const b = canvas.boards[`${board}.dc.html`];
  if (!b) throw new Error(`canvas.json has no board ${board}`);
  return { width: b.w, height: b.h };
};
// [id, board, app path, mobile has a board]
const DESKTOP: Array<[string, string, string, boolean]> = [
  ["home", "Home", "/", true],
  ["send", "Send", "/__gallery/send?stage=chosen", true],
  ["send-empty", "SendEmpty", "/__gallery/send?stage=empty", true],
  ["send-toolarge", "SendTooLarge", "/__gallery/send?stage=toolarge", true],
  ["send-emptyfile", "SendEmptyFile", "/__gallery/send?stage=emptyfile", true],
  ["stream-play", "SendScreen", "/__gallery/stream?mode=play", true],
  ["stream-paused", "SendScreenPaused", "/__gallery/stream?mode=paused", true],
  ["stream-step", "SendScreenStep", "/__gallery/stream?mode=step", true],
  ["stream-full", "SendScreenFull", "/__gallery/stream-full", true],
  ["paper-a4", "SendPaper", "/__gallery/paper?size=a4", true],
  ["paper-letter", "SendPaperLetter", "/__gallery/paper?size=letter", true],
  ["receive", "Receive", "/__gallery/receive", false],
  ["about", "About", "/about", true],
  ["errors", "Errors", "/__gallery/errors", true],
  ["errors-all", "ErrorsAll", "/__gallery/errors-all", true],
];
const withFlag = (path: string): string => path + (path.includes("?") ? "&" : "?") + "mobile=1";
export const TARGETS: Target[] = [
  ...DESKTOP.map(([id, board, app]): Target => ({ id, group: "desktop", board: `/${board}.dc.html`, app, ...size(board) })),
  ...DESKTOP.filter((d) => d[3]).map(
    ([id, board, app]): Target => ({ id: `${id}-mobile`, group: "mobile", board: `/${board}Mobile.dc.html`, app: id === "home" || id === "about" ? app : withFlag(app), ...size(`${board}Mobile`) }),
  ),
  ...RECEIVE_PHASES.map((p): Target => ({ id: `receive-${p}`, group: "phase", board: `/__w-ReceiveState-${p}.dc.html`, app: `/__gallery/receive-phase?phase=${p}`, width: 390, height: 860 })),
  ...ERROR_KINDS.map((k): Target => ({ id: `error-${k}`, group: "kind", board: `/__w-ErrorState-${k}.dc.html`, app: `/__gallery/error?kind=${k}`, width: 420, height: 620 })),
];
