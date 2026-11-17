// Latin-1 mapping (R1.13): one byte becomes one character with the same code, so the qr string API stays lossless.
const CHUNK = 8192; // keeps String.fromCharCode.apply under argument-count limits

export function bytesToLatin1(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, b.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return s;
}

/** Text encoder handed to qr: every character code is at most 0xFF and becomes one byte. */
export const latin1TextEncoder = {
  encode(s: string): Uint8Array {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
};
