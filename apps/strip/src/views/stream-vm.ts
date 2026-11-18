// View-models of the Send on screen boards (SendScreen and SendScreenFull renderVals).
import type { SymbolMatrix } from "@strip/symbols";
export type StreamMode = "play" | "paused" | "step";
export interface StreamInput {
  mode: StreamMode;
  /** The Packet shown, 1-based. */
  n: number;
  /** K, the number of source packets: the counter's "of K + repair". */
  k: number;
  lap: number;
  fps: number;
  /** "field-notes-2026.pdf · 184 KB" */
  fileTag: string;
  matrix: SymbolMatrix;
  /** The board's mobile class; only the gallery sets it. */
  rootCls?: string;
}
export interface StreamVM {
  rootCls: string;
  fileTag: string;
  modeTag: string;
  modeTagCls: string;
  ppLabel: string;
  modeNote: string;
  isPlay: boolean;
  notPlay: boolean;
  isStep: boolean;
  notStep: boolean;
  /** Previous and Next are disabled while playing. */
  stepOff: boolean;
  n: number;
  max: number;
  ofTotal: string;
  lap: string;
  codeLabel: string;
  matrix: SymbolMatrix;
  speed: string;
  fpsValue: number;
  loopNote: string;
}
export function toStreamVM(i: StreamInput): StreamVM {
  const modes: Record<StreamMode, { tag: string; cls: string; pp: string; note: string }> = {
    play: { tag: "Playing", cls: "tag--cobalt", pp: "Pause", note: `Playing at ${i.fps} fps. Pause to step by hand.` },
    paused: { tag: "Paused", cls: "tag--signal", pp: "Play", note: "Paused. Previous and Next step one packet." },
    step: { tag: "Step mode", cls: "tag--solid", pp: "Play", note: "Step mode: the code changes only when you press Next or Previous." },
  };
  const t = modes[i.mode];
  return {
    rootCls: i.rootCls ?? "",
    fileTag: i.fileTag,
    modeTag: t.tag,
    modeTagCls: t.cls,
    ppLabel: t.pp,
    modeNote: t.note,
    isPlay: i.mode === "play",
    notPlay: i.mode !== "play",
    isStep: i.mode === "step",
    notStep: i.mode !== "step",
    stepOff: i.mode === "play",
    n: i.n,
    max: i.k,
    ofTotal: `of ${i.k} + repair`,
    lap: `Lap ${i.lap}`,
    codeLabel: `Animated data code, packet ${i.n} of ${i.k}`,
    matrix: i.matrix,
    speed: `${i.fps} fps`,
    fpsValue: i.fps,
    loopNote: `After packet ${i.k} the code keeps looping repair packets until you stop. A scanner can start at any point.`,
  };
}
export interface FullScreenVM {
  rootCls: string;
  matrix: SymbolMatrix;
  codeLabel: string;
  meta: string;
}
export function toFullScreenVM(i: StreamInput): FullScreenVM {
  return {
    rootCls: i.rootCls ?? "",
    matrix: i.matrix,
    codeLabel: `Animated data code, packet ${i.n} of ${i.k}`,
    meta: `Packet ${i.n} of ${i.k} + repair · Lap ${i.lap} · ${i.fps} fps`,
  };
}
