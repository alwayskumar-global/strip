// View-models of the error boards (ErrorState renderVals, Appendix F), with the copy built from a context.
import { arc } from "../components/Ring.js";
export const ERROR_KINDS = ["size", "empty", "imgread", "imgbig", "imgmany", "nocode", "denied", "nocamera", "nothing", "otherfile", "hash", "internal", "camera", "stall"] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];
/** The facts the copy mentions. Every field has the board's instance value as its default. */
export interface ErrorContext {
  fileName?: string;
  /** "1.4 MB" */
  size?: string;
  /** File cap in KB. */
  capKb?: number;
  imageName?: string;
  imageSize?: string;
  imageLimit?: string;
  photos?: string;
  pagesNeeded?: string;
  lastSymbol?: string;
  sessionCurrent?: string;
  sessionOther?: string;
  expected?: string;
  got?: string;
  solved?: number;
  total?: number;
  seen?: number;
  lastBlock?: string;
}
export interface ErrorVM {
  iconFile: boolean;
  iconCam: boolean;
  iconClock: boolean;
  iconAlert: boolean;
  isSize: boolean;
  isStall: boolean;
  tag: string;
  title: string;
  msg: string;
  rows: Array<{ k: string; v: string }>;
  tips: Array<{ t: string }>;
  limitEnd: string;
  fileEnd: string;
  frozen: string;
  stallPct: number;
  stallTotal: number;
  ringD: string;
  primary: string;
  primaryHref: string;
  secondary: string;
  secondaryHref: string;
}
export interface ErrorsVM {
  rootCls: string;
  panels: ErrorVM[];
}
// Route targets. "About limits" goes to the Limits section of About (a listed deviation from the board's plain /about).
const R = "/receive";
const SND = "/send";
const H = "/";
const LIMITS = "/about#limits";
const TIPS = [{ t: "Move to 30–50 cm from the screen." }, { t: "Raise the sender’s brightness." }, { t: "Ask the sender to drop to 4–6 fps." }];
export function toErrorVM(kind: ErrorKind, c: ErrorContext = {}): ErrorVM {
  const cap = c.capKb ?? 256;
  const name = c.fileName ?? "big-report.pdf";
  const size = c.size ?? "1.4 MB";
  const img = c.imageName ?? "IMG_2041.jpg";
  const solved = c.solved ?? 82;
  const total = c.total ?? 111;
  const pct = Math.round((100 * solved) / Math.max(1, total)); // the board shows 74 for 82 / 111 (rounded, not floored)
  const M: Record<ErrorKind, { tag: string; title: string; msg: string; rows: Array<{ k: string; v: string }>; primary: string; ph: string; secondary: string; sh: string }> = {
    size: { tag: "File too large", title: "This file is too big for Strip", msg: `${name} is ${size}. Strip carries files up to ${cap} KB. Compress it, or split it into smaller files.`, rows: [{ k: "File", v: name }, { k: "Size", v: size }, { k: "Limit", v: `${cap} KB` }], primary: "Choose another file", ph: SND, secondary: "About limits", sh: LIMITS },
    empty: { tag: "Empty file", title: "This file has no content", msg: `${c.fileName ?? "empty.txt"} is 0 bytes, so there is nothing to send.`, rows: [{ k: "File", v: c.fileName ?? "empty.txt" }, { k: "Size", v: "0 bytes" }], primary: "Choose another file", ph: SND, secondary: "Back to home", sh: H },
    imgread: { tag: "Image unreadable", title: "We couldn’t read this image", msg: "The file is not an image this browser can open, or it is damaged.", rows: [{ k: "File", v: c.imageName ?? "IMG_2041.heic" }], primary: "Choose another photo", ph: R, secondary: "Use the camera", sh: R },
    imgbig: { tag: "Image too large", title: "This image is too large", msg: `${img} is ${c.imageSize ?? "28 MB"}, and photos up to ${c.imageLimit ?? "20 MB"} can be read.`, rows: [{ k: "File", v: img }, { k: "Size", v: c.imageSize ?? "28 MB" }, { k: "Limit", v: c.imageLimit ?? "20 MB" }], primary: "Choose a smaller photo", ph: R, secondary: "Use the camera", sh: R },
    imgmany: { tag: "Too many images", title: "You have added the most photos allowed", msg: "Remove a photo to add another, or scan the remaining pages with the camera.", rows: [{ k: "Photos", v: c.photos ?? "24 / 24" }, { k: "Pages needed", v: c.pagesNeeded ?? "17" }], primary: "Review added photos", ph: R, secondary: "Use the camera", sh: R },
    nocode: { tag: "No code found", title: "No code found in this image", msg: "Retake the photo flat, in good light, with the whole page in frame.", rows: [{ k: "File", v: c.imageName ?? "IMG_2043.jpg" }, { k: "Symbols found", v: "0" }], primary: "Try another photo", ph: R, secondary: "Use the camera", sh: R },
    denied: { tag: "Camera blocked", title: "Camera access was denied", msg: "Allow the camera for this site in your browser settings, then try again.", rows: [], primary: "Try again", ph: R, secondary: "Add photo of a page", sh: R },
    nocamera: { tag: "No camera found", title: "No camera on this device", msg: "You can still receive by adding photos or scans of the printed pages.", rows: [], primary: "Add photo of a page", ph: R, secondary: "Back to home", sh: H },
    nothing: { tag: "Camera stalled", title: "Nothing readable for a while", msg: "No symbol has been read for 30 seconds, so steady the phone, add light, or move closer.", rows: [{ k: "Last symbol", v: c.lastSymbol ?? "32 s ago" }, { k: "Distance", v: "Aim for 30–50 cm" }], primary: "Keep scanning", ph: R, secondary: "Add photo of a page", sh: R },
    otherfile: { tag: "Different file", title: "These pages belong to a different file", msg: "Pages from two sessions can’t be combined, so keep one set and start over with the other.", rows: [{ k: "Current session", v: c.sessionCurrent ?? "7F3A" }, { k: "Other session", v: c.sessionOther ?? "4C21" }], primary: "Start over", ph: R, secondary: "Keep current file", sh: R },
    hash: { tag: "Verification failed", title: "The file did not verify", msg: "The rebuilt file doesn’t match the sender’s hash, so nothing was saved.", rows: [{ k: "Expected", v: c.expected ?? "a1b2c3d4e5f6" }, { k: "Got", v: c.got ?? "9f8e7d6c5b4a" }], primary: "Scan again", ph: R, secondary: "Discard", sh: H },
    internal: { tag: "Something went wrong", title: "Something went wrong inside Strip", msg: "The app hit an unexpected error and stopped, so reload the page and try again.", rows: [], primary: "Reload", ph: H, secondary: "Back to home", sh: H },
    camera: { tag: "Camera unavailable", title: "This browser can’t use the camera", msg: "Receive needs the camera API, which is missing here. Open Strip in a current browser over HTTPS, ideally on a phone. Sending still works from this device.", rows: [{ k: "Camera API", v: "Missing" }, { k: "Secure context", v: "Yes (HTTPS)" }, { k: "Send", v: "Available" }], primary: "Open Send", ph: SND, secondary: "Copy page link", sh: "#" },
    stall: { tag: "Decode stalled", title: "No progress for 20 seconds", msg: `${solved} of ${total} blocks are solved. The remaining blocks need packets the camera has not read cleanly yet.`, rows: [{ k: "Blocks solved", v: `${solved} / ${total}` }, { k: "Packets seen", v: String(c.seen ?? 143) }, { k: "Last new block", v: c.lastBlock ?? "21 s ago" }], primary: "Keep scanning", ph: R, secondary: "Start over", sh: R },
  };
  const m = M[kind];
  const cam = kind === "camera" || kind === "denied" || kind === "nocamera";
  const clock = kind === "stall" || kind === "nothing";
  const file = kind === "size" || kind === "empty" || kind === "imgread" || kind === "imgbig";
  return {
    iconFile: file,
    iconCam: cam,
    iconClock: clock,
    iconAlert: !(file || cam || clock),
    isSize: kind === "size",
    isStall: kind === "stall",
    tag: m.tag,
    title: m.title,
    msg: m.msg,
    rows: m.rows,
    tips: kind === "stall" ? TIPS : [],
    limitEnd: `${cap} KB limit`,
    fileEnd: `${size} file`,
    frozen: `Frozen at ${solved} / ${total}`,
    stallPct: pct,
    stallTotal: total,
    ringD: arc(pct),
    primary: m.primary,
    primaryHref: m.ph,
    secondary: m.secondary,
    secondaryHref: m.sh,
  };
}
export const toErrorsVM = (kinds: readonly ErrorKind[], rootCls = ""): ErrorsVM => ({ rootCls, panels: kinds.map((k) => toErrorVM(k)) });
