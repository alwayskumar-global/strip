// Receive reducer (design: State machines (d), R5, R12, R13). Pure: effects are returned, never run.
// The camera events are part of the table; the container wires the camera in Group 3.
import { IMAGE_MAX_BYTES, IMAGE_MAX_PHOTOS } from "../limits.js";
import type { ErrorContext, ErrorKind } from "../views/error-vm.js";
import type { ReceivePhase } from "../views/receive-vm.js";
import { verdict, type Timing } from "./receive-timers.js";
export type { ReceivePhase } from "../views/receive-vm.js";
export type PanelKind = ErrorKind;
export interface Panel {
  kind: PanelKind;
  ctx: ErrorContext;
}
export type Source = "camera" | { photo: number };
export interface Counters {
  seen: number;
  skipped: number;
  solved: number;
  total: number;
  distinct: number;
  complete: boolean;
}
export interface PhotoRow {
  id: number;
  name: string;
  found: number;
}
export interface FileResult {
  name: string;
  mime: string;
  size: number;
  hash12: string;
}
export interface ReceiveState {
  phase: ReceivePhase;
  panel: Panel | null;
  /** Session generation: bumped by every new session; results carrying an older one are dropped. */
  gen: number;
  cameraOn: boolean;
  cameraPending: boolean;
  torchCapable: boolean;
  counters: Counters;
  session?: number;
  foreign?: { id: number; dismissed: boolean };
  photos: PhotoRow[];
  imageBusy: boolean;
  /** The phase to return to when a panel is dismissed. */
  resume: ReceivePhase;
  result?: FileResult;
  hashes?: { expected: string; actual: string };
  /** Camera clocks, in the Clock's time (R12.19 to R12.21). */
  t: Timing;
  diag: { badCrc: number; badHeader: number };
}
export type PushResult =
  | { k: "accepted"; counters: Omit<Counters, "seen" | "skipped"> }
  | { k: "ignored"; reason: "DUPLICATE_PACKET" | "SESSION_MISMATCH" | "ALREADY_COMPLETE" | "DENSE_STORE_FULL"; foreign?: number }
  | { k: "rejected"; code: string; hashes?: { expected: string; actual: string }; totalLength?: number };
export type ReceiveEvent =
  | { t: "START" }
  | { t: "STOP" }
  | { t: "START_OVER" }
  | { t: "KEEP" }
  | { t: "SWITCH" }
  | { t: "CANCEL" }
  | { t: "DOWNLOAD" }
  | { t: "RECEIVE_ANOTHER" }
  | { t: "DISCARD" }
  | { t: "SCAN_AGAIN" }
  | { t: "BACK" }
  | { t: "NOT_NOW" }
  | { t: "PANEL"; action: "primary" | "secondary"; at?: number }
  | { t: "ADD_PHOTO"; name: string; size: number }
  | { t: "PHOTO_DONE"; gen: number; row: PhotoRow | null }
  | { t: "PHOTO_FAILED"; gen: number; panel: PanelKind; ctx?: ErrorContext }
  | { t: "REMOVE_PHOTO"; id: number }
  | { t: "REBUILT"; gen: number; counters: Omit<Counters, "seen" | "skipped">; session?: number }
  | { t: "CAMERA_OK"; torch: boolean; at?: number }
  | { t: "CAMERA_FAIL"; name: string }
  | { t: "CAMERA_API_MISSING" }
  | { t: "PUSHED"; gen: number; source: Source; result: PushResult; sessionOf?: number; at?: number }
  | { t: "FOUND"; at: number }
  | { t: "TIMER"; at: number }
  | { t: "RESULT"; gen: number; result: FileResult }
  | { t: "PUSH_SLOW"; gen: number }
  | { t: "REPEAT_EXPIRED"; gen: number };
export type ReceiveEffect =
  | "REQUEST_CAMERA"
  | "STOP_CAMERA"
  | "NEW_SESSION"
  | "OPEN_PICKER"
  | "DOWNLOAD_FILE"
  | "READ_RESULT"
  | "REBUILD_SESSION"
  | "COPY_LINK"
  | "ARM_REPEAT_HOLD"
  | "RELOAD"
  | { e: "START_IMAGE"; gen: number; name: string }
  | { e: "REMOVE_PHOTO"; id: number }
  | { e: "ADOPT_PENDING" }
  | { e: "DISCARD_PENDING" }
  | { e: "NAVIGATE"; to: string };
const ZERO: Counters = { seen: 0, skipped: 0, solved: 0, total: 0, distinct: 0, complete: false };
export const initialReceive: ReceiveState = { phase: "empty", panel: null, gen: 0, cameraOn: false, cameraPending: false, torchCapable: false, counters: ZERO, photos: [], imageBusy: false, resume: "empty", t: {}, diag: { badCrc: 0, badHeader: 0 } };
type R = { state: ReceiveState; effects: ReceiveEffect[] };
const same = (s: ReceiveState): R => ({ state: s, effects: [] });
const TERMINAL: ReadonlySet<ReceivePhase> = new Set(["done", "failed"]);
/** A fresh session: counters, photos and the file are cleared. */
function fresh(s: ReceiveState, phase: ReceivePhase): ReceiveState {
  const { foreign: _f, session: _s, result: _r, hashes: _h, ...rest } = s;
  void _f;
  void _s;
  void _r;
  void _h;
  return { ...rest, phase, panel: null, gen: s.gen + 1, counters: ZERO, t: {}, photos: [], imageBusy: false, resume: phase, cameraOn: phase === "scan" ? s.cameraOn : false, cameraPending: false };
}
function withPanel(s: ReceiveState, kind: PanelKind, ctx: ErrorContext = {}): ReceiveState {
  return { ...s, panel: { kind, ctx }, resume: s.panel ? s.resume : s.phase };
}
export function reduceReceive(s: ReceiveState, ev: ReceiveEvent): R {
  // Results of an older session are dropped (stale generations).
  if ((ev.t === "PUSHED" || ev.t === "RESULT" || ev.t === "PHOTO_DONE" || ev.t === "PHOTO_FAILED" || ev.t === "REBUILT" || ev.t === "PUSH_SLOW" || ev.t === "REPEAT_EXPIRED") && ev.gen !== s.gen) return same(s);
  switch (ev.t) {
    case "START":
      if (s.phase === "empty" || s.phase === "denied" || (s.phase === "ask" && !s.cameraPending)) return { state: { ...s, phase: "ask", cameraPending: true, panel: null }, effects: ["REQUEST_CAMERA"] };
      return same(s);
    case "NOT_NOW":
      return s.phase === "ask" ? { state: s, effects: [{ e: "NAVIGATE", to: "/" }] } : same(s);
    case "BACK":
      return s.phase === "empty" || s.phase === "denied" || s.phase === "nocam" ? { state: s, effects: [{ e: "NAVIGATE", to: "/" }] } : same(s);
    case "CAMERA_OK":
      return s.phase === "ask" || s.cameraPending ? { state: { ...s, phase: "scan", cameraOn: true, cameraPending: false, torchCapable: ev.torch, panel: null, t: ev.at === undefined ? s.t : { ...s.t, cameraStartedAt: ev.at } }, effects: [] } : same(s);
    case "CAMERA_FAIL": {
      if (!(s.phase === "ask" || s.cameraPending)) return same(s);
      const denied = ev.name === "NotAllowedError" || ev.name === "SecurityError";
      return { state: { ...s, phase: denied ? "denied" : "nocam", cameraOn: false, cameraPending: false }, effects: [] };
    }
    case "CAMERA_API_MISSING":
      return s.phase === "empty" || s.phase === "ask" ? { state: withPanel({ ...s, cameraPending: false }, "camera"), effects: [] } : same(s);
    case "STOP":
      return s.phase === "scan" || s.phase === "repeat" ? { state: { ...s, phase: "empty", cameraOn: false }, effects: ["STOP_CAMERA"] } : same(s);
    case "START_OVER":
      return s.phase === "scan" || s.phase === "repeat" ? { state: fresh(s, "scan"), effects: ["NEW_SESSION"] } : same(s);
    case "KEEP":
      return s.phase === "dup" ? { state: { ...s, phase: "scan", foreign: s.foreign ? { ...s.foreign, dismissed: true } : undefined } as ReceiveState, effects: [] } : same(s);
    case "SWITCH":
      return s.phase === "dup" ? { state: fresh(s, "scan"), effects: ["NEW_SESSION"] } : same(s);
    case "CANCEL":
      return s.phase === "verify" ? { state: fresh(s, "empty"), effects: ["NEW_SESSION", "STOP_CAMERA"] } : same(s);
    case "DOWNLOAD":
      return s.phase === "done" ? { state: s, effects: ["DOWNLOAD_FILE"] } : same(s);
    case "RECEIVE_ANOTHER":
      return s.phase === "done" ? { state: fresh(s, "empty"), effects: ["NEW_SESSION"] } : same(s);
    case "DISCARD":
      return s.phase === "failed" ? { state: fresh(s, "empty"), effects: ["NEW_SESSION"] } : same(s);
    case "SCAN_AGAIN":
      return s.phase === "failed" ? { state: { ...fresh(s, "scan"), cameraPending: true }, effects: ["NEW_SESSION", "REQUEST_CAMERA"] } : same(s);
    case "ADD_PHOTO": {
      if (s.imageBusy) return same(s);
      if (s.photos.length >= IMAGE_MAX_PHOTOS) return { state: withPanel(s, "imgmany", { photos: `${s.photos.length} / ${IMAGE_MAX_PHOTOS}` }), effects: [] };
      if (ev.size > IMAGE_MAX_BYTES) return { state: withPanel(s, "imgbig", { imageName: ev.name, imageSize: `${Math.ceil(ev.size / 1_048_576)} MB`, imageLimit: `${IMAGE_MAX_BYTES / 1_048_576} MB` }), effects: [] };
      return { state: { ...s, imageBusy: true, panel: null }, effects: [{ e: "START_IMAGE", gen: s.gen, name: ev.name }] };
    }
    case "PHOTO_DONE":
      return { state: { ...s, imageBusy: false, photos: ev.row ? [...s.photos, ev.row] : s.photos }, effects: [] };
    case "PHOTO_FAILED":
      return { state: withPanel({ ...s, imageBusy: false }, ev.panel, ev.ctx ?? {}), effects: [] };
    case "REMOVE_PHOTO":
      return { state: { ...s, photos: s.photos.filter((p) => p.id !== ev.id) }, effects: [{ e: "REMOVE_PHOTO", id: ev.id }, "REBUILD_SESSION"] };
    case "REBUILT": {
      const c: Counters = { ...ev.counters, seen: s.counters.seen, skipped: s.counters.skipped };
      const phase: ReceivePhase = ev.counters.complete ? "done" : s.phase === "done" ? "empty" : s.phase;
      const base = { ...s, counters: c, phase };
      return { state: ev.session === undefined ? (({ session: _x, ...r }) => (void _x, r as ReceiveState))(base) : { ...base, session: ev.session }, effects: [] };
    }
    case "PUSHED":
      return pushed(s, ev);
    case "FOUND":
      return { state: { ...s, t: { ...s.t, lastFoundAt: ev.at } }, effects: [] };
    case "TIMER": {
      if (s.panel || !(s.phase === "scan" || s.phase === "repeat" || s.phase === "dup")) return same(s);
      const v = verdict(s.t, ev.at, s.cameraOn);
      return v === null ? same(s) : { state: withPanel(s, v, v === "stall" ? { solved: s.counters.solved, total: s.counters.total, seen: s.counters.seen } : {}), effects: [] };
    }
    case "RESULT":
      return { state: { ...s, result: ev.result }, effects: [] };
    case "PUSH_SLOW":
      return s.phase === "scan" || s.phase === "repeat" || s.phase === "dup" ? { state: { ...s, phase: "verify", cameraOn: false }, effects: ["STOP_CAMERA"] } : same(s);
    case "REPEAT_EXPIRED":
      return s.phase === "repeat" ? { state: { ...s, phase: "scan" }, effects: [] } : same(s);
    case "PANEL":
      return panelAction(s, ev.action, ev.at);
  }
}
/** "Keep scanning": both clocks restart from now. */
function restartClocks(t: ReceiveState["t"], at: number | undefined): ReceiveState["t"] {
  if (at === undefined) return t;
  return { cameraStartedAt: at, lastFoundAt: at, ...(t.firstAcceptedAt === undefined ? {} : { firstAcceptedAt: at, lastSolvedAt: at }) };
}
function pushed(s: ReceiveState, ev: Extract<ReceiveEvent, { t: "PUSHED" }>): R {
  const cam = ev.source === "camera";
  const r = ev.result;
  if (TERMINAL.has(s.phase)) return same(s);
  if (r.k === "accepted") {
    const counters: Counters = { ...r.counters, seen: s.counters.seen + 1, skipped: s.counters.skipped };
    const session = s.session ?? ev.sessionOf;
    const grew = r.counters.solved > s.counters.solved;
    const t: Timing = ev.at === undefined || !cam ? s.t : { ...s.t, firstAcceptedAt: s.t.firstAcceptedAt ?? ev.at, lastSolvedAt: grew || s.t.lastSolvedAt === undefined ? ev.at : s.t.lastSolvedAt };
    const base: ReceiveState = { ...s, counters, t, ...(session === undefined ? {} : { session }) };
    if (r.counters.complete) return { state: { ...base, phase: "done", cameraOn: false, cameraPending: false, panel: null }, effects: ["STOP_CAMERA", "READ_RESULT"] };
    return { state: s.phase === "repeat" && cam ? { ...base, phase: "scan" } : base, effects: [] };
  }
  if (r.k === "ignored") {
    const seen = s.counters.seen + 1;
    const c = { ...s.counters, seen };
    if (r.reason === "DUPLICATE_PACKET" && cam && (s.phase === "scan" || s.phase === "repeat")) return { state: { ...s, counters: c, phase: "repeat" }, effects: ["ARM_REPEAT_HOLD"] };
    if (r.reason === "SESSION_MISMATCH" && cam && (s.phase === "scan" || s.phase === "repeat" || s.phase === "dup")) {
      const counters = { ...c, skipped: s.counters.skipped + 1 };
      if (s.phase === "dup" || s.foreign?.dismissed) return { state: { ...s, counters }, effects: [] };
      return { state: { ...s, counters, phase: "dup", foreign: { id: r.foreign ?? 0, dismissed: false } }, effects: [] };
    }
    if (r.reason === "SESSION_MISMATCH" && !cam) return { state: withPanel({ ...s, counters: c }, "otherfile", { sessionCurrent: hex(s.session), sessionOther: hex(r.foreign) }), effects: [] };
    return { state: { ...s, counters: c }, effects: [] };
  }
  // rejected
  if (r.code === "BAD_CRC") return { state: { ...s, diag: { ...s.diag, badCrc: s.diag.badCrc + 1 } }, effects: [] };
  if (r.code === "BAD_HEADER") return { state: { ...s, diag: { ...s.diag, badHeader: s.diag.badHeader + 1 } }, effects: [] };
  if (r.code === "HASH_MISMATCH") {
    const hashes = r.hashes;
    if (cam || s.phase === "scan" || s.phase === "repeat" || s.phase === "dup" || s.phase === "verify") return { state: { ...s, phase: "failed", cameraOn: false, ...(hashes ? { hashes } : {}) }, effects: ["STOP_CAMERA"] };
    return { state: withPanel({ ...s, ...(hashes ? { hashes } : {}) }, "hash", { expected: hashes?.expected, got: hashes?.actual }), effects: [] };
  }
  if (r.code === "PAYLOAD_TOO_LARGE" || r.code === "TOO_MANY_BLOCKS") return { state: withPanel({ ...s, cameraOn: false }, "size", { fileName: "This strip", size: r.totalLength === undefined ? undefined : `${Math.ceil(r.totalLength / 1024)} KB` }), effects: ["STOP_CAMERA"] };
  return { state: withPanel({ ...s, cameraOn: false }, "internal"), effects: ["STOP_CAMERA"] };
}
const hex = (n: number | undefined): string | undefined => (n === undefined ? undefined : ((n >>> 16) & 0xffff).toString(16).toUpperCase().padStart(4, "0"));
function panelAction(s: ReceiveState, action: "primary" | "secondary", at?: number): R {
  const p = s.panel;
  if (!p) return same(s);
  const clear: ReceiveState = { ...s, panel: null, phase: s.resume === "done" ? "done" : s.phase };
  switch (p.kind) {
    case "otherfile":
      return action === "primary" ? { state: { ...fresh(s, s.cameraOn ? "scan" : "empty"), panel: null }, effects: ["NEW_SESSION", { e: "ADOPT_PENDING" }] } : { state: clear, effects: [{ e: "DISCARD_PENDING" }] };
    case "stall":
      return action === "primary" ? { state: { ...clear, t: restartClocks(s.t, at) }, effects: [] } : { state: { ...fresh(s, s.cameraOn ? "scan" : "empty") }, effects: ["NEW_SESSION"] };
    case "nothing":
      return action === "primary" ? { state: { ...clear, t: restartClocks(s.t, at) }, effects: [] } : { state: clear, effects: ["OPEN_PICKER"] };
    case "hash":
      return action === "primary" ? { state: fresh(s, "empty"), effects: ["NEW_SESSION"] } : { state: fresh(s, "empty"), effects: ["NEW_SESSION", { e: "NAVIGATE", to: "/" }] };
    case "internal":
      return action === "primary" ? { state: s, effects: ["RELOAD"] } : { state: fresh(s, "empty"), effects: [{ e: "NAVIGATE", to: "/" }] };
    case "camera":
      return action === "primary" ? { state: s, effects: [{ e: "NAVIGATE", to: "/send" }] } : { state: s, effects: ["COPY_LINK"] };
    case "size":
    case "empty":
      return action === "primary" ? { state: clear, effects: [{ e: "NAVIGATE", to: "/send" }] } : { state: clear, effects: [{ e: "NAVIGATE", to: "/about#limits" }] };
    case "denied":
      return action === "primary" ? { state: { ...clear, phase: "ask", cameraPending: true }, effects: ["REQUEST_CAMERA"] } : { state: clear, effects: ["OPEN_PICKER"] };
    case "nocamera":
      return action === "primary" ? { state: clear, effects: ["OPEN_PICKER"] } : { state: clear, effects: [{ e: "NAVIGATE", to: "/" }] };
    default:
      // imgread, imgbig, imgmany, nocode: the primary action opens the picker (or reviews the list); the secondary uses the camera.
      return action === "primary" ? { state: clear, effects: p.kind === "imgmany" ? [] : ["OPEN_PICKER"] } : { state: { ...clear, phase: "ask", cameraPending: true }, effects: ["REQUEST_CAMERA"] };
  }
}
