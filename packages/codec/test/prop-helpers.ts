import fc from "fast-check";

/** Deterministic bytes from a seed (no Math.random). */
export function lcgBytes(n: number, seed: number): Uint8Array {
  let x = (seed >>> 0) || 1;
  return Uint8Array.from({ length: n }, () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x >>> 24;
  });
}

/** Seeded Fisher-Yates copy. */
export function shuffleWith<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let x = (seed >>> 0) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const NAME_CHARS = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 0x20, max: 0x7e }).filter((c) => c !== 0x2f && c !== 0x5c) },
  { weight: 2, arbitrary: fc.integer({ min: 0xa0, max: 0x2fff }) },
  { weight: 1, arbitrary: fc.integer({ min: 0x1f300, max: 0x1f64f }) },
);

/** Valid file names: no separators, no control characters, not "." or "..", at most 255 UTF-8 bytes. */
export const arbName: fc.Arbitrary<string> = fc
  .array(NAME_CHARS, { minLength: 1, maxLength: 60 })
  .map((cs) => String.fromCodePoint(...cs))
  .filter((s) => s !== "." && s !== "..");

export const arbMime: fc.Arbitrary<string> = fc.array(fc.integer({ min: 0x20, max: 0x7e }), { maxLength: 40 }).map((cs) => String.fromCharCode(...cs));

export interface PayloadCase {
  readonly bytes: Uint8Array;
  readonly packetSize: number;
  readonly name: string;
  readonly mime: string;
}

const arbShape = fc.oneof(
  fc.record({ packetSize: fc.constant(2953), len: fc.integer({ min: 0, max: 70000 }) }),
  fc.record({ packetSize: fc.integer({ min: 46, max: 400 }), len: fc.integer({ min: 0, max: 8000 }) }),
  fc
    .record({ packetSize: fc.integer({ min: 46, max: 400 }), mult: fc.integer({ min: 0, max: 20 }), off: fc.constantFrom(-1, 0, 1) })
    .map((r) => ({ packetSize: r.packetSize, len: Math.max(0, (r.packetSize - 30) * r.mult + r.off) })),
);

/** Payload, packet size, name and MIME: mixes seeded bulk bytes, fc.uint8Array and block-boundary lengths. */
export const arbCase: fc.Arbitrary<PayloadCase> = fc.oneof(
  fc.record({ shape: arbShape, seed: fc.integer(), name: arbName, mime: arbMime }).map((r) => ({
    bytes: lcgBytes(r.shape.len, r.seed),
    packetSize: r.shape.packetSize,
    name: r.name,
    mime: r.mime,
  })),
  fc.record({ bytes: fc.uint8Array({ maxLength: 300 }), packetSize: fc.integer({ min: 46, max: 400 }), name: arbName, mime: arbMime }),
);

/** Small cases (a few hundred blocks at most) for properties that touch many packets. */
export const arbSmallCase: fc.Arbitrary<PayloadCase> = fc
  .record({ len: fc.integer({ min: 0, max: 1500 }), seed: fc.integer(), packetSize: fc.integer({ min: 46, max: 200 }), name: arbName, mime: arbMime })
  .map((r) => ({ bytes: lcgBytes(r.len, r.seed), packetSize: r.packetSize, name: r.name, mime: r.mime }));

export const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
