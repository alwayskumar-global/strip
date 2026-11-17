// Internal decoder seam (R11.6). No third-party type appears here, so none leaks through the barrel (R11.7).
import type { EccLevel, ImageDataLike } from "./types.js";

export type Point = { x: number; y: number };
export type Corners = readonly [Point, Point, Point, Point];

export type ReaderOptions = {
  readonly formats: readonly ["QRCode"];
  readonly tryHarder: boolean;
  readonly tryRotate: boolean;
  readonly tryDownscale: boolean;
  readonly tryInvert: boolean;
  readonly maxNumberOfSymbols: number;
  readonly binarizer: "LocalAverage" | "GlobalHistogram";
};

export type BackendResult = {
  /** Raw payload bytes, a fresh copy. */
  readonly bytes: Uint8Array;
  readonly version?: number;
  readonly ecc?: EccLevel;
  /** Top-left, top-right, bottom-right, bottom-left, in input pixels. */
  readonly corners?: Corners;
};

export interface DecoderBackend {
  /** Resolves with the first symbol found, or undefined when there is none. */
  read(frame: ImageDataLike, options: ReaderOptions): Promise<BackendResult | undefined>;
  /** Resolves with every valid symbol found, up to options.maxNumberOfSymbols, in the reader's order. */
  readMany(frame: ImageDataLike, options: ReaderOptions): Promise<BackendResult[]>;
}
