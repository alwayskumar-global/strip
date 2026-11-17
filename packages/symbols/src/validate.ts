// Hand-written validators (R5.5, R8.3). Each throws SymbolError INVALID_INPUT before any other processing.
import { SymbolError } from "./errors.js";
import { ECC_LEVELS } from "./types.js";
import type { DecodeOptions, EncodeOptions, ImageDataLike, RenderOptions } from "./types.js";

const bad = (message: string): never => {
  throw new SymbolError("INVALID_INPUT", message);
};
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const KEYWORDS = new Set(["black", "white", "red", "green", "blue", "navy", "gray", "grey", "silver", "transparent"]);
const COLOUR = /^#[0-9a-fA-F]{3,8}$/;
const isColour = (c: unknown): boolean => typeof c === "string" && (COLOUR.test(c) || KEYWORDS.has(c));

export function assertBytes(v: unknown, name = "bytes"): asserts v is Uint8Array {
  if (!(v instanceof Uint8Array)) bad(`${name} must be a Uint8Array`);
  if ((v as Uint8Array).length < 1) bad(`${name} must not be empty`);
}

export function assertImageDataLike(v: unknown): asserts v is ImageDataLike {
  if (!isRecord(v)) return bad("frame must be an object with width, height and data");
  const { width, height, data } = v;
  if (!isInt(width) || width < 1) bad("frame width must be a positive integer");
  if (!isInt(height) || height < 1) bad("frame height must be a positive integer");
  if (!(data instanceof Uint8ClampedArray)) bad("frame data must be a Uint8ClampedArray");
  if ((data as Uint8ClampedArray).length !== (width as number) * (height as number) * 4) {
    bad("frame data length must equal width x height x 4");
  }
}

export function assertEncodeOptions(v: unknown): asserts v is EncodeOptions | undefined {
  if (v === undefined) return;
  if (!isRecord(v)) return bad("encode options must be an object");
  const { ecc, version } = v;
  if (ecc !== undefined && !(ECC_LEVELS as readonly unknown[]).includes(ecc)) bad("ecc must be one of L, M, Q, H");
  if (version !== undefined && (!isInt(version) || version < 1 || version > 40)) {
    bad("version must be an integer in 1..40");
  }
}

export function assertRenderOptions(v: unknown): asserts v is RenderOptions {
  if (!isRecord(v)) return bad("render options must be an object");
  const { ppm, quietZone, allowShortQuietZone, dark, light, mm } = v;
  if (!isInt(ppm) || ppm < 1) bad("ppm must be an integer >= 1");
  if (allowShortQuietZone !== undefined && typeof allowShortQuietZone !== "boolean") {
    bad("allowShortQuietZone must be a boolean");
  }
  if (quietZone !== undefined && (!isInt(quietZone) || quietZone < 0)) bad("quietZone must be an integer >= 0");
  if (typeof quietZone === "number" && quietZone < 4 && allowShortQuietZone !== true) {
    bad("quietZone below 4 modules needs allowShortQuietZone");
  }
  for (const [name, c] of [["dark", dark], ["light", light]] as const) {
    if (c !== undefined && !isColour(c)) bad(`${name} must be a hex colour or a short keyword`);
  }
  if (mm !== undefined && (typeof mm !== "number" || !Number.isFinite(mm) || mm <= 0)) {
    bad("mm must be a positive finite number");
  }
}

export function assertDecodeOptions(v: unknown): asserts v is DecodeOptions {
  if (!isRecord(v)) return bad("decode options must be an object");
  const { wasm, mode } = v;
  if (mode !== undefined && mode !== "video" && mode !== "photo") bad("mode must be video or photo");
  if (wasm === undefined) return;
  if (!isRecord(wasm)) return bad("wasm source must be an object");
  if (wasm.kind === "url") {
    if (typeof wasm.url !== "string" || wasm.url.length === 0) bad("wasm url must be a non-empty string");
  } else if (wasm.kind === "bytes") {
    const b = wasm.bytes;
    if (!(b instanceof ArrayBuffer) && !(b instanceof Uint8Array)) bad("wasm bytes must be an ArrayBuffer or Uint8Array");
    if ((b as ArrayBuffer | Uint8Array).byteLength === 0) bad("wasm bytes must not be empty");
  } else bad("wasm source kind must be url or bytes");
}
