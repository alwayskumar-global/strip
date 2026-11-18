// Send step 1 reducer (design: State machines (a), R2, R9). Pure: effects are returned, never run.
import { classify, mimeOf } from "./file-rules.js";
export type SendStage = "empty" | "chosen" | "toolarge" | "emptyfile";
export type SendOutput = "screen" | "paper";
export type FailurePanel = "size" | "internal";
export interface FileMeta {
  name: string;
  mime: string;
  size: number;
}
export interface SendCosts {
  K: number;
  T: number;
  N: number;
  /** First 12 hex digits of the SHA-256. */
  hash12: string;
  sessionId: number;
}
export interface SendStepState {
  stage: SendStage;
  gen: number;
  meta?: FileMeta;
  costs?: SendCosts;
  output: SendOutput;
  reading: boolean;
  failure?: FailurePanel;
}
export type SendEvent =
  | { t: "PICK"; name: string; type: string; size: number }
  | { t: "READ_DONE"; gen: number; meta: FileMeta; costs: SendCosts }
  | { t: "READ_FAILED"; gen: number; meta: FileMeta; panel: FailurePanel }
  | { t: "REMOVE" }
  | { t: "OUTPUT"; value: SendOutput }
  | { t: "CONTINUE" };
export type SendEffect = { e: "READ_AND_ENCODE"; gen: number; meta: FileMeta } | { e: "DROP_BYTES" } | { e: "NAVIGATE"; to: "/send/screen" | "/send/paper" };
export const initialSendState: SendStepState = { stage: "empty", gen: 0, output: "screen", reading: false };
export function reduceSend(s: SendStepState, ev: SendEvent): { state: SendStepState; effects: SendEffect[] } {
  switch (ev.t) {
    case "PICK": {
      const meta: FileMeta = { name: ev.name, mime: mimeOf(ev.type), size: ev.size };
      const gen = s.gen + 1;
      const c = classify(ev.size);
      if (c === "chosen") {
        const { failure: _f, ...rest } = s; // the previous card stays visible while the new file is read
        void _f;
        return { state: { ...rest, gen, reading: true }, effects: [{ e: "READ_AND_ENCODE", gen, meta }] };
      }
      return { state: { ...withoutCosts(s), stage: c, meta, gen, reading: false }, effects: [{ e: "DROP_BYTES" }] };
    }
    case "READ_DONE":
      if (ev.gen !== s.gen) return { state: s, effects: [] };
      return { state: { ...s, stage: "chosen", meta: ev.meta, costs: ev.costs, output: "screen", reading: false }, effects: [] };
    case "READ_FAILED":
      if (ev.gen !== s.gen) return { state: s, effects: [] };
      return { state: { ...withoutCosts(s), stage: "empty", meta: ev.meta, reading: false, failure: ev.panel }, effects: [{ e: "DROP_BYTES" }] };
    case "REMOVE":
      if (s.stage === "empty") {
        const { failure: _f, ...rest } = s; // dismisses a failure panel
        void _f;
        return { state: rest, effects: [] };
      }
      return { state: { ...withoutCosts(s), stage: "empty", gen: s.gen + 1, reading: false }, effects: [{ e: "DROP_BYTES" }] };
    case "OUTPUT":
      return s.stage === "chosen" ? { state: { ...s, output: ev.value }, effects: [] } : { state: s, effects: [] };
    case "CONTINUE":
      return s.stage === "chosen" ? { state: s, effects: [{ e: "NAVIGATE", to: s.output === "screen" ? "/send/screen" : "/send/paper" }] } : { state: s, effects: [] };
  }
}
function withoutCosts(s: SendStepState): SendStepState {
  const { costs: _c, meta: _m, failure: _f, ...rest } = s;
  void _c;
  void _m;
  void _f;
  return rest;
}
