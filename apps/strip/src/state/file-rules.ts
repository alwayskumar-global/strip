// File classification before any byte is read (R2.2, R2.11, R2.12, R2.14, R9.2). Pure.
import { FILE_CAP_BYTES } from "../limits.js";
export type FileClass = "emptyfile" | "chosen" | "toolarge";
export const classify = (size: number): FileClass => (size === 0 ? "emptyfile" : size > FILE_CAP_BYTES ? "toolarge" : "chosen");
const FALLBACK = "application/octet-stream";
/** A codec MIME type: at most 127 bytes, all of them ASCII. Empty or invalid becomes application/octet-stream. */
export function mimeOf(type: string): string {
  if (type === "" || type.length > 127) return FALLBACK;
  for (let i = 0; i < type.length; i++) if (type.charCodeAt(i) > 0x7f) return FALLBACK;
  return type;
}
