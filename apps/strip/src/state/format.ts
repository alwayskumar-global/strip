// Size and hash text (R2.3, R2.4, R2.11). Pure.
import { FILE_CAP_BYTES } from "../limits.js";
export const thousands = (n: number): string => n.toLocaleString("en-US");
/** "{bytes} bytes" below 1 KB, "{n} KB" below 1 MB, otherwise "{n.n} MB". Rounds up, so the text never understates a size. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1_048_576) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(Math.ceil(bytes / 104_857.6) / 10).toFixed(1)} MB`;
}
/** "{n} bytes" with thousands separators. */
export const formatBytes = (bytes: number): string => `${thousands(bytes)} bytes`;
/** The cap in KB, as shown in "Max {cap} KB". */
export const CAP_KB = FILE_CAP_BYTES / 1024;
/** First 12 lowercase hex digits as three groups of four. */
export function hashChip(hex12: string): [string, string, string] {
  return [hex12.slice(0, 4), hex12.slice(4, 8), hex12.slice(8, 12)];
}
export const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
