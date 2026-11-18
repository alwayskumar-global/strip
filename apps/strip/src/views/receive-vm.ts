// View-model of the Receive board (ReceiveState renderVals, Appendix D), with the numbers computed from the inputs.
import type { SymbolMatrix } from "@strip/symbols";
export const RECEIVE_PHASES = ["empty", "ask", "denied", "nocam", "scan", "repeat", "dup", "verify", "done", "failed"] as const;
export type ReceivePhase = (typeof RECEIVE_PHASES)[number];
export interface PhotoRow {
  name: string;
  found: number;
}
export interface ReceiveInput {
  phase: ReceivePhase;
  /** Packets_Seen. */
  seen: number;
  solved: number;
  /** Distinct packets, shown capped at `total`. */
  distinct: number;
  /** K, the number of source packets; 0 while unknown. */
  total: number;
  /** Ring percent. Defaults to floor(100 x solved / total), 0 while total is 0. */
  pct?: number;
  photos: PhotoRow[];
  /** `repeat` HUD: the packet number already seen. */
  packetN?: number;
  /** `dup`: packets skipped from the other session, and the two session ids. */
  skipped?: number;
  sessionA?: string;
  sessionB?: string;
  /** `done`: file facts. */
  doneName?: string;
  doneSize?: string;
  doneHash?: string;
  /** `failed`: the hashes in the banner. */
  expected?: string;
  got?: string;
  /** The mock code of the viewfinder (the camera is the container's own element, passed as a slot). */
  codeMatrix: SymbolMatrix;
}
export interface ReceiveVM {
  tag: string;
  tagCls: string;
  head: string;
  msg: string;
  pct: number;
  ringCls: string;
  seen: string;
  solved: string;
  total: number;
  primary: string;
  primaryCls: string;
  primaryOff: boolean;
  secondary: string;
  vfCls: string;
  vfNote: string;
  hud: string;
  camState: string;
  isDenied: boolean;
  isVerify: boolean;
  isDone: boolean;
  isNocam: boolean;
  hasPrimaryBtn: boolean;
  showCode: boolean;
  showMsg: boolean;
  showDone: boolean;
  camOn: boolean;
  camOff: boolean;
  showHud: boolean;
  showTorch: boolean;
  hasBanner: boolean;
  bannerCls: string;
  bannerTitle: string;
  bannerMsg: string;
  showBar: boolean;
  /** The board has no meter in this phase: the meter is an addition and carries data-addition. */
  barAdd: boolean;
  distinct: number;
  photos: PhotoRow[];
  hasPhotos: boolean;
  noPhotos: boolean;
  photoCount: string;
  photoHint: string;
  howto: Array<{ t: string }>;
  done: { name: string; size: string; match: string };
  codeMatrix: SymbolMatrix;
}
const P = "btn btn--primary btn--lg btn--block";
const PLAIN = "btn btn--lg btn--block";
interface Row {
  tag: string;
  tagCls: string;
  head: string;
  msg: (i: ReceiveInput) => string;
  ring: string;
  primary: string;
  pcls: string;
  off?: boolean;
  sec: string;
  vf: string;
  note?: string;
  hud?: (i: ReceiveInput) => string;
  cam: string;
  icon?: "on" | "off";
  hint?: string;
  bar?: boolean;
  banner?: { cls: string; title: string; msg: (i: ReceiveInput) => string };
}
const ROWS: Record<ReceivePhase, Row> = {
  empty: { tag: "Ready", tagCls: "tag", head: "Scan a strip or a screen", msg: () => "Start the camera, or add a photo of a printed page.", ring: "ring--dim", primary: "Start camera", pcls: P, sec: "Back", vf: "vf--idle", note: "Camera is off", cam: "Camera: off", icon: "on", hint: "No photos added yet. Add one page at a time." },
  ask: { tag: "Waiting for permission", tagCls: "tag", head: "Allow camera access", msg: () => "Strip reads codes with your camera. Video is processed on this device and never recorded or sent.", ring: "ring--dim", primary: "Allow camera", pcls: P, sec: "Not now", vf: "vf--idle", note: "Camera permission needed", cam: "Camera: asking", icon: "on", hint: "No photos added yet. You can add a photo instead of using the camera." },
  denied: { tag: "Camera blocked", tagCls: "tag tag--signal", head: "Camera access denied", msg: () => "Your browser blocked the camera for this site. Allow it, then try again.", ring: "ring--dim", primary: "Try again", pcls: P, sec: "Back", vf: "vf--idle vf--warn", note: "Camera blocked", cam: "Camera: blocked", icon: "off", hint: "No photos added yet. Photos of the printed pages work without the camera." },
  nocam: { tag: "No camera", tagCls: "tag tag--signal", head: "No camera on this device", msg: () => "Receive works without one. Add a photo or scan of each printed page instead.", ring: "", primary: "Add photo of a page", pcls: P, sec: "Back", vf: "vf--idle", note: "No camera found", cam: "Camera: none", icon: "off", bar: true },
  scan: { tag: "Scanning", tagCls: "tag tag--cobalt", head: "Keep the code in frame", msg: () => "Hold steady. Blocks solve as packets arrive; order does not matter.", ring: "", primary: "Stop scanning", pcls: PLAIN, sec: "Start over", vf: "", hud: () => "Looking for packets", cam: "Camera: on", bar: true },
  repeat: { tag: "Duplicate frame", tagCls: "tag", head: "Same frame again", msg: () => "Waiting for a new packet.", ring: "", primary: "Stop scanning", pcls: PLAIN, sec: "Start over", vf: "vf--idle", hud: (i) => `Packet ${i.packetN ?? 0} already seen`, cam: "Camera: on", bar: true, banner: { cls: "callout--tip", title: "Duplicate frame ignored", msg: () => "This frame was already counted. Let the sender’s screen advance, or move to the next printed code." } },
  dup: { tag: "Other session", tagCls: "tag tag--signal", head: "A different transfer is in view", msg: (i) => `Still solving the first file. ${i.skipped ?? 0} packets from another session were skipped.`, ring: "", primary: "Keep current file", pcls: P, sec: "Switch to new", vf: "vf--warn", hud: (i) => `Session ${i.sessionA ?? ""} ≠ ${i.sessionB ?? ""}`, cam: "Camera: on", bar: true, banner: { cls: "callout--warn", title: "Wrong or repeated code", msg: (i) => `Packets from session ${i.sessionA ?? ""} do not belong to this file. Point the camera back at the original code, or switch.` } },
  verify: { tag: "Verifying", tagCls: "tag tag--cobalt", head: "Checking SHA-256", msg: (i) => `All ${i.total} packets are in. Comparing the file hash with the sender’s.`, ring: "", primary: "Verifying…", pcls: P, off: true, sec: "Cancel", vf: "vf--idle", hud: () => "Camera paused", cam: "Camera: paused" },
  done: { tag: "Complete", tagCls: "tag tag--solid", head: "File received", msg: () => "Hash verified. The file is ready to download.", ring: "", primary: "Download", pcls: "btn btn--cobalt btn--lg btn--block", sec: "Receive another", vf: "vf--done", cam: "Camera: paused" },
  failed: { tag: "Verification failed", tagCls: "tag tag--signal", head: "File does not match", msg: () => "The file may be incomplete or a block was misread. Nothing was saved. Scan again from the start.", ring: "ring--bad", primary: "Scan again", pcls: "btn btn--signal btn--lg btn--block", sec: "Discard", vf: "vf--idle", hud: () => "Camera paused", cam: "Camera: paused", banner: { cls: "callout--error", title: "Hash mismatch", msg: (i) => `Expected ${i.expected ?? ""}, got ${i.got ?? ""}` } },
};
/** Phases where the board shows the Distinct packets meter; elsewhere the meter is an addition (data-addition). */
const BOARD_BAR: ReadonlySet<ReceivePhase> = new Set(["nocam", "scan", "repeat", "dup"]);
const HOWTO = [{ t: "Open the site settings from the address bar." }, { t: "Set Camera to Allow." }, { t: "Return here and tap Try again." }];
export function toReceiveVM(i: ReceiveInput): ReceiveVM {
  const r = ROWS[i.phase];
  const k = i.phase;
  const pct = i.pct ?? (i.total > 0 ? Math.floor((100 * i.solved) / i.total) : 0);
  const n = i.photos.length;
  const symbols = i.photos.reduce((a, p) => a + p.found, 0);
  const hud = r.hud ? r.hud(i) : "";
  const showBar = i.total > 0;
  return {
    tag: r.tag,
    tagCls: r.tagCls,
    head: r.head,
    msg: r.msg(i),
    pct,
    ringCls: r.ring,
    seen: String(i.seen),
    solved: String(i.solved),
    total: i.total,
    primary: r.primary,
    primaryCls: r.pcls,
    primaryOff: r.off === true,
    secondary: r.sec,
    vfCls: r.vf,
    vfNote: r.note ?? "",
    hud,
    camState: r.cam,
    isDenied: k === "denied",
    isVerify: k === "verify",
    isDone: k === "done",
    isNocam: k === "nocam",
    hasPrimaryBtn: k !== "nocam",
    showCode: k === "scan" || k === "repeat" || k === "dup" || k === "verify" || k === "failed",
    showMsg: k === "empty" || k === "ask" || k === "denied" || k === "nocam",
    showDone: k === "done",
    camOn: r.icon === "on",
    camOff: r.icon === "off",
    showHud: hud !== "",
    showTorch: k === "scan" || k === "repeat" || k === "dup",
    hasBanner: r.banner !== undefined,
    bannerCls: r.banner?.cls ?? "",
    bannerTitle: r.banner?.title ?? "",
    bannerMsg: r.banner?.msg(i) ?? "",
    showBar,
    barAdd: showBar && !BOARD_BAR.has(k),
    distinct: Math.min(i.distinct, i.total),
    photos: i.photos,
    hasPhotos: n > 0,
    noPhotos: n === 0,
    photoCount: n > 0 ? `${n} ${n === 1 ? "photo" : "photos"} · ${symbols} ${symbols === 1 ? "symbol" : "symbols"}` : "None",
    photoHint: r.hint ?? "",
    howto: HOWTO,
    done: { name: i.doneName ?? "", size: i.doneSize ?? "", match: `SHA-256 match · ${i.doneHash ?? ""}` },
    codeMatrix: i.codeMatrix,
  };
}
