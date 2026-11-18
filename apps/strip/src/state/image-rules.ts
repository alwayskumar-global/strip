// Image limits and scaling (R9.9, R12.11 to R12.13). Pure.
import { IMAGE_LONG_SIDE, IMAGE_MAX_BYTES, IMAGE_MAX_PHOTOS } from "../limits.js";
/** Output size of an image: unchanged when both sides fit, otherwise scaled so the long side is IMAGE_LONG_SIDE. */
export function scaleOf(width: number, height: number): { width: number; height: number; scaled: boolean } {
  const long = Math.max(width, height);
  if (long <= IMAGE_LONG_SIDE) return { width, height, scaled: false };
  const k = IMAGE_LONG_SIDE / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), scaled: true };
}
export type ImageRefusal = "imgbig" | "imgmany";
/** Refuses an image before decoding it: too large a file, or the Photo_List is full. */
export function refuseImage(fileBytes: number, photoCount: number): ImageRefusal | null {
  if (fileBytes > IMAGE_MAX_BYTES) return "imgbig";
  if (photoCount >= IMAGE_MAX_PHOTOS) return "imgmany";
  return null;
}
