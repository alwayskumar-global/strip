// Error code to disposition (Appendix E, R13). Total by construction: every table is a Record over its union, so a new
// code in the codec or symbols packages fails the compile. Nothing here carries a raw code to the DOM.
import type { ErrorCode, IgnoreReason } from "@strip/codec";
import type { DecodeOutcome, SymbolErrorCode } from "@strip/symbols";
import type { ErrorKind } from "../views/error-vm.js";
import type { ReceivePhase } from "../views/receive-vm.js";
export type Origin = "camera" | "image" | "encoder";
export type Disposition =
  | { to: "phase"; phase: ReceivePhase }
  | { to: "panel"; kind: ErrorKind }
  | { to: "sendState"; state: "toolarge" | "emptyfile" }
  | { to: "silent"; count: "diag" | "seen" | "none" }
  | { to: "push" }
  | { to: "unreachable" };
const U: Disposition = { to: "unreachable" };
const panel = (kind: ErrorKind): Disposition => ({ to: "panel", kind });
const SIZE = panel("size");
const INTERNAL = panel("internal");
const DIAG: Disposition = { to: "silent", count: "diag" };
const SEEN: Disposition = { to: "silent", count: "seen" };
type PerOrigin = Record<Origin, Disposition>;
const same = (d: Disposition): PerOrigin => ({ camera: d, image: d, encoder: d });
const receiverOnly = (camera: Disposition, image: Disposition): PerOrigin => ({ camera, image, encoder: U });
const CODEC: Record<ErrorCode, PerOrigin> = {
  INVALID_INPUT: same(INTERNAL),
  PAYLOAD_TOO_LARGE: same(SIZE),
  TOO_MANY_BLOCKS: same(SIZE),
  BAD_METADATA: same(INTERNAL),
  BAD_HEADER: receiverOnly(DIAG, DIAG),
  UNSUPPORTED_VERSION: same(INTERNAL),
  BAD_CRC: receiverOnly(DIAG, DIAG),
  SESSION_MISMATCH: receiverOnly({ to: "phase", phase: "dup" }, panel("otherfile")),
  INCOMPLETE_DECODE: same(U),
  HASH_MISMATCH: receiverOnly({ to: "phase", phase: "failed" }, panel("hash")),
};
/** `cameraOn`: an image whose hash fails while the camera is scanning ends in the `failed` phase, as the camera path does. */
export function ofCodec(code: ErrorCode, origin: Origin, cameraOn: boolean): Disposition {
  if (code === "HASH_MISMATCH" && origin === "image" && cameraOn) return { to: "phase", phase: "failed" };
  return CODEC[code][origin];
}
const IGNORE: Record<IgnoreReason, PerOrigin> = {
  DUPLICATE_PACKET: receiverOnly({ to: "phase", phase: "repeat" }, SEEN),
  SESSION_MISMATCH: receiverOnly({ to: "phase", phase: "dup" }, panel("otherfile")),
  ALREADY_COMPLETE: receiverOnly(SEEN, SEEN),
  DENSE_STORE_FULL: receiverOnly(SEEN, SEEN),
};
export const ofIgnore = (reason: IgnoreReason, origin: Origin): Disposition => IGNORE[reason][origin];
const SYMBOL: Record<SymbolErrorCode, Disposition> = { INVALID_INPUT: INTERNAL, PACKET_TOO_LARGE: INTERNAL, ENCODE_FAILED: INTERNAL, UNSUPPORTED_ENVIRONMENT: INTERNAL };
export const ofSymbol = (code: SymbolErrorCode): Disposition => SYMBOL[code];
const NOTHING_READ = (origin: Origin): Disposition => (origin === "image" ? panel("nocode") : origin === "camera" ? { to: "silent", count: "none" } : U);
const OUTCOME: Record<DecodeOutcome["kind"], (o: Origin) => Disposition> = {
  found: () => ({ to: "push" }),
  found_many: () => ({ to: "push" }),
  not_found: NOTHING_READ,
  not_strip_packet: NOTHING_READ,
  dropped: NOTHING_READ,
};
export const ofOutcome = (kind: DecodeOutcome["kind"], origin: Origin): Disposition => OUTCOME[kind](origin);
export type ImageFailure = "unreadable" | "toolarge" | "toomany" | "nopacket";
const IMAGE: Record<ImageFailure, Disposition> = { unreadable: panel("imgread"), toolarge: panel("imgbig"), toomany: panel("imgmany"), nopacket: panel("nocode") };
export const ofImage = (f: ImageFailure): Disposition => IMAGE[f];
export const CAMERA_ERROR_NAMES = ["NotAllowedError", "SecurityError", "NotFoundError", "NotReadableError", "OverconstrainedError", "AbortError"] as const;
const CAMERA: Record<(typeof CAMERA_ERROR_NAMES)[number], Disposition> = {
  NotAllowedError: { to: "phase", phase: "denied" },
  SecurityError: { to: "phase", phase: "denied" },
  NotFoundError: { to: "phase", phase: "nocam" },
  NotReadableError: { to: "phase", phase: "nocam" },
  OverconstrainedError: { to: "phase", phase: "nocam" },
  AbortError: { to: "phase", phase: "nocam" },
};
/** A camera failure by name; the API missing is the `camera` panel; any other name is a generic camera failure (`camera` panel). */
export function ofCamera(name: string | "API_MISSING"): Disposition {
  if (name === "API_MISSING") return panel("camera");
  return (CAMERA as Record<string, Disposition | undefined>)[name] ?? panel("camera");
}
/** Any other exception: the `internal` panel, never its message. */
export const ofException = (): Disposition => INTERNAL;
