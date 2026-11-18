// Send on screen reducer (design: State machines (b), R3, R11). Pure: effects are returned, never run.
import { FPS_DEFAULT, FPS_MAX, FPS_MIN, STEP_HISTORY } from "../limits.js";
export type StreamMode = "play" | "paused" | "step";
export type CodeSize = "s" | "m" | "l";
export interface StreamUi {
  mode: StreamMode;
  fps: number;
  size: CodeSize;
  fullScreen: boolean;
  /** The Packet shown, 1-based. */
  n: number;
  /** Packets produced so far (the encoder's next() calls). */
  produced: number;
  mounted: boolean;
}
export type StreamEvent =
  | { t: "MOUNT"; reducedMotion: boolean }
  | { t: "TOGGLE" }
  | { t: "NOTICE_BUTTON" }
  | { t: "TICK" }
  | { t: "NEXT" }
  | { t: "PREV" }
  | { t: "FPS"; value: number }
  | { t: "SIZE"; value: CodeSize }
  | { t: "FULLSCREEN"; on: boolean }
  | { t: "HIDDEN" };
export type StreamEffect = "START_TICKER" | "STOP_TICKER" | "SHOW" | { e: "FPS"; fps: number } | { e: "FULLSCREEN"; on: boolean };
export const initialStream: StreamUi = { mode: "play", fps: FPS_DEFAULT, size: "m", fullScreen: false, n: 1, produced: 1, mounted: false };
/** Previous is possible while the packet before the shown one is still held in the history ring. */
export const canPrev = (s: StreamUi): boolean => s.n - 1 >= Math.max(1, s.produced - STEP_HISTORY + 1);
const clampFps = (v: number): number => Math.min(FPS_MAX, Math.max(FPS_MIN, Math.round(v)));
type R = { state: StreamUi; effects: StreamEffect[] };
const advance = (s: StreamUi): StreamUi => ({ ...s, n: s.n + 1, produced: Math.max(s.produced, s.n + 1) });
export function reduceStream(s: StreamUi, ev: StreamEvent): R {
  switch (ev.t) {
    case "MOUNT":
      return ev.reducedMotion ? { state: { ...s, mounted: true, mode: "step", n: 1, produced: 1 }, effects: ["SHOW"] } : { state: { ...s, mounted: true, mode: "play", n: 1, produced: 1 }, effects: ["SHOW", "START_TICKER"] };
    case "TOGGLE":
      if (s.mode === "play") return { state: { ...s, mode: "paused" }, effects: ["STOP_TICKER"] };
      return { state: { ...s, mode: "play" }, effects: ["START_TICKER"] };
    case "NOTICE_BUTTON":
      if (s.mode === "step") return { state: { ...s, mode: "play" }, effects: ["START_TICKER"] };
      return { state: { ...s, mode: "step" }, effects: ["STOP_TICKER"] };
    case "TICK":
      return s.mode === "play" ? { state: advance(s), effects: ["SHOW"] } : { state: s, effects: [] };
    case "NEXT":
      return s.mode === "play" ? { state: s, effects: [] } : { state: advance(s), effects: ["SHOW"] };
    case "PREV":
      return s.mode === "play" || !canPrev(s) ? { state: s, effects: [] } : { state: { ...s, n: s.n - 1 }, effects: ["SHOW"] };
    case "FPS":
      if (s.mode === "step") return { state: s, effects: [] };
      return { state: { ...s, fps: clampFps(ev.value) }, effects: [{ e: "FPS", fps: clampFps(ev.value) }] };
    case "SIZE":
      return { state: { ...s, size: ev.value }, effects: [] };
    case "FULLSCREEN":
      return { state: { ...s, fullScreen: ev.on }, effects: [{ e: "FULLSCREEN", on: ev.on }] };
    case "HIDDEN":
      return s.mode === "play" ? { state: { ...s, mode: "paused" }, effects: ["STOP_TICKER"] } : { state: s, effects: [] };
  }
}
/** Lap of the Packet shown: floor((n - 1) / T) + 1 (Resolved question 27: a lap is T Packets). */
export const lapOf = (n: number, T: number): number => Math.floor((n - 1) / Math.max(1, T)) + 1;
