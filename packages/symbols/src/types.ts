// Public option and input types shared by validators and the modules that use them.
export const ECC_LEVELS = ["L", "M", "Q", "H"] as const;
export type EccLevel = (typeof ECC_LEVELS)[number];
export type EncodeOptions = { ecc?: EccLevel; version?: number };
export type RenderOptions = {
  ppm: number;
  quietZone?: number;
  allowShortQuietZone?: boolean;
  dark?: string;
  light?: string;
  /** SVG only: physical edge length in millimetres. */
  mm?: number;
};
export type ImageDataLike = { width: number; height: number; data: Uint8ClampedArray };
export type WasmSource =
  | { kind: "url"; url: string }
  | { kind: "bytes"; bytes: ArrayBuffer | Uint8Array };
export type DecodeMode = "video" | "photo";
export type DecodeOptions = { wasm?: WasmSource; mode?: DecodeMode; maxSymbols?: number };
