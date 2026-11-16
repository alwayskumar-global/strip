import { describe, expect, it } from "vitest";
import { decodeUtf8, encodeUtf8, parseMetadata, readRecordLength, serializeMetadata, type Metadata } from "../src/metadata.js";
import { codeOf } from "./helpers.js";

const sha = (fill = 0xab) => new Uint8Array(32).fill(fill);
const meta = (over: Partial<Metadata> = {}): Metadata => ({
  name: "report.pdf",
  mime: "application/pdf",
  byteLength: 123456,
  sha256: sha(),
  ...over,
});

describe("serializeMetadata layout (R1.1)", () => {
  it("writes version, u16 name length, name, u8 mime length, mime, u32 length, sha256", () => {
    const b = serializeMetadata(meta({ name: "a.txt", mime: "text/plain", byteLength: 0x01020304, sha256: sha(9) }));
    expect(b[0]).toBe(1);
    expect([b[1], b[2]]).toEqual([0, 5]);
    expect(String.fromCharCode(...b.subarray(3, 8))).toBe("a.txt");
    expect(b[8]).toBe(10);
    expect(String.fromCharCode(...b.subarray(9, 19))).toBe("text/plain");
    expect([...b.subarray(19, 23)]).toEqual([1, 2, 3, 4]);
    expect([...b.subarray(23, 55)]).toEqual(new Array(32).fill(9));
    expect(b.length).toBe(55);
  });

  it("round trips ascii, unicode and empty-mime metadata", () => {
    for (const m of [
      meta(),
      meta({ name: "日本語のファイル.txt", mime: "text/plain" }),
      meta({ name: "emoji-😀-é.bin", mime: "" }),
      meta({ byteLength: 0 }),
      meta({ byteLength: 0xffffffff }),
    ]) {
      expect(parseMetadata(serializeMetadata(m))).toEqual(m);
    }
  });

  it("R1.8: a zero-length payload gives a valid record", () => {
    const b = serializeMetadata(meta({ byteLength: 0 }));
    expect(parseMetadata(b).byteLength).toBe(0);
  });
});

describe("name rules (R1.4)", () => {
  const rejected = (name: string) => codeOf(() => serializeMetadata(meta({ name })));
  it("rejects empty, dot names, separators and control characters", () => {
    for (const n of ["", ".", "..", "a/b", "a\\b", "/", "x\u0000y", "x\u0001y", "x\u001fy", "x\u007fy", "\n", "tab\there"]) {
      expect(rejected(n), JSON.stringify(n)).toBe("BAD_METADATA");
    }
  });
  it("accepts dots inside names and C1-adjacent printable characters", () => {
    for (const n of [".hidden", "a.b.c", "...", "name with spaces", "é"]) expect(rejected(n), n).toBeUndefined();
  });
  it("limits the name to 255 UTF-8 bytes", () => {
    expect(rejected("a".repeat(255))).toBeUndefined();
    expect(rejected("a".repeat(256))).toBe("BAD_METADATA");
    expect(rejected("é".repeat(127))).toBeUndefined(); // 254 bytes
    expect(rejected("é".repeat(128))).toBe("BAD_METADATA"); // 256 bytes
    expect(rejected("😀".repeat(63))).toBeUndefined(); // 252 bytes
    expect(rejected("😀".repeat(64))).toBe("BAD_METADATA"); // 256 bytes
  });
  it("rejects lone surrogates", () => {
    expect(rejected("a\ud800b")).toBe("BAD_METADATA");
    expect(rejected("a\udc00b")).toBe("BAD_METADATA");
    expect(rejected("\ud83d")).toBe("BAD_METADATA");
  });
  it("parseMetadata applies the same name rules to received records", () => {
    const rec = serializeMetadata(meta({ name: "abc" }));
    const evil = rec.slice();
    evil[3] = 0x2f; // "/bc"
    expect(codeOf(() => parseMetadata(evil))).toBe("BAD_METADATA");
    const ctl = rec.slice();
    ctl[4] = 0x00;
    expect(codeOf(() => parseMetadata(ctl))).toBe("BAD_METADATA");
  });
});

describe("MIME rules (R1.5)", () => {
  const rejected = (mime: string) => codeOf(() => serializeMetadata(meta({ mime })));
  it("limits MIME to 127 ASCII bytes", () => {
    expect(rejected("a".repeat(127))).toBeUndefined();
    expect(rejected("a".repeat(128))).toBe("BAD_METADATA");
    expect(rejected("text/pláin")).toBe("BAD_METADATA");
    expect(rejected("\u0080")).toBe("BAD_METADATA");
    expect(rejected("\u007f")).toBeUndefined();
  });
});

describe("shape validation", () => {
  it("rejects wrong types with INVALID_INPUT", () => {
    const m = meta();
    expect(codeOf(() => serializeMetadata({ ...m, sha256: new Uint8Array(31) }))).toBe("INVALID_INPUT");
    expect(codeOf(() => serializeMetadata({ ...m, byteLength: -1 }))).toBe("INVALID_INPUT");
    expect(codeOf(() => serializeMetadata({ ...m, byteLength: 2 ** 32 }))).toBe("INVALID_INPUT");
    expect(codeOf(() => serializeMetadata({ ...m, byteLength: 1.5 }))).toBe("INVALID_INPUT");
    expect(codeOf(() => serializeMetadata({ ...m, name: 5 as unknown as string }))).toBe("INVALID_INPUT");
    expect(codeOf(() => serializeMetadata(null as unknown as Metadata))).toBe("INVALID_INPUT");
    expect(codeOf(() => parseMetadata([1, 2] as unknown as Uint8Array))).toBe("INVALID_INPUT");
  });
});

describe("parseMetadata rejections (R1.6, R1.7)", () => {
  const good = serializeMetadata(meta({ name: "ab", mime: "x/y" }));

  it("rejects every strict prefix as truncated", () => {
    for (let n = 0; n < good.length; n++) {
      expect(codeOf(() => parseMetadata(good.subarray(0, n))), `prefix ${n}`).toBe("BAD_METADATA");
    }
  });
  it("rejects trailing bytes", () => {
    const t = new Uint8Array(good.length + 1);
    t.set(good);
    expect(codeOf(() => parseMetadata(t))).toBe("BAD_METADATA");
  });
  it("rejects a name length that overruns the record", () => {
    const b = good.slice();
    b[1] = 0xff;
    b[2] = 0xff;
    expect(codeOf(() => parseMetadata(b))).toBe("BAD_METADATA");
  });
  it("rejects a mime length that overruns the record", () => {
    const b = good.slice();
    b[3 + 2] = 200;
    expect(codeOf(() => parseMetadata(b))).toBe("BAD_METADATA");
  });
  it("rejects an unsupported record version (and checks it before anything else)", () => {
    for (const v of [0, 2, 255]) {
      const b = good.slice();
      b[0] = v;
      expect(codeOf(() => parseMetadata(b)), `v${v}`).toBe("UNSUPPORTED_VERSION");
    }
    const garbage = Uint8Array.from([7, 0xff, 0xff]);
    expect(codeOf(() => parseMetadata(garbage))).toBe("UNSUPPORTED_VERSION");
  });
  it("rejects non-ASCII MIME bytes and invalid UTF-8 names in a record", () => {
    const m = good.slice();
    m[3 + 2 + 1] = 0xc3; // first mime byte
    expect(codeOf(() => parseMetadata(m))).toBe("BAD_METADATA");
    const n = good.slice();
    n[3] = 0xff;
    expect(codeOf(() => parseMetadata(n))).toBe("BAD_METADATA");
  });
});

describe("readRecordLength (R1.12)", () => {
  it("returns the record length and ignores trailing payload bytes", () => {
    const rec = serializeMetadata(meta({ name: "photo.jpg", mime: "image/jpeg" }));
    const stream = new Uint8Array(rec.length + 1000).fill(0xee);
    stream.set(rec);
    expect(readRecordLength(stream)).toBe(rec.length);
    expect(parseMetadata(stream.subarray(0, readRecordLength(stream)))).toEqual(
      meta({ name: "photo.jpg", mime: "image/jpeg" }),
    );
  });
  it("needs only the bytes through the mime length field", () => {
    const rec = serializeMetadata(meta({ name: "ab", mime: "x/y" }));
    expect(readRecordLength(rec.subarray(0, 3 + 2 + 1))).toBe(rec.length);
    expect(codeOf(() => readRecordLength(rec.subarray(0, 3 + 2)))).toBe("BAD_METADATA");
    expect(codeOf(() => readRecordLength(rec.subarray(0, 2)))).toBe("BAD_METADATA");
    expect(codeOf(() => readRecordLength(new Uint8Array(0)))).toBe("BAD_METADATA");
  });
  it("reports UNSUPPORTED_VERSION for a bad version byte", () => {
    expect(codeOf(() => readRecordLength(Uint8Array.from([9, 0, 1, 65, 0])))).toBe("UNSUPPORTED_VERSION");
  });
});

describe("hand-written UTF-8", () => {
  it("matches known encodings", () => {
    expect([...encodeUtf8("A")]).toEqual([0x41]);
    expect([...encodeUtf8("é")]).toEqual([0xc3, 0xa9]);
    expect([...encodeUtf8("€")]).toEqual([0xe2, 0x82, 0xac]);
    expect([...encodeUtf8("😀")]).toEqual([0xf0, 0x9f, 0x98, 0x80]);
    expect([...encodeUtf8("\u{10ffff}")]).toEqual([0xf4, 0x8f, 0xbf, 0xbf]);
    expect(decodeUtf8(Uint8Array.from([0xf0, 0x9f, 0x98, 0x80]))).toBe("😀");
  });
  it("decodes every well-formed boundary code point", () => {
    for (const cp of [0, 0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xe000, 0xffff, 0x10000, 0x10ffff]) {
      const s = String.fromCodePoint(cp);
      expect(decodeUtf8(encodeUtf8(s))).toBe(s);
    }
  });
  it("rejects overlong forms, surrogates, out-of-range and malformed sequences", () => {
    const bads: number[][] = [
      [0xc0, 0x80],
      [0xc1, 0xbf],
      [0xe0, 0x80, 0x80],
      [0xe0, 0x9f, 0xbf],
      [0xf0, 0x80, 0x80, 0x80],
      [0xf0, 0x8f, 0xbf, 0xbf],
      [0xed, 0xa0, 0x80],
      [0xed, 0xbf, 0xbf],
      [0xf4, 0x90, 0x80, 0x80],
      [0xf5, 0x80, 0x80, 0x80],
      [0xff],
      [0x80],
      [0xc3],
      [0xe2, 0x82],
      [0xf0, 0x9f, 0x98],
      [0xc3, 0x28],
      [0xe2, 0x28, 0xa1],
    ];
    for (const b of bads) expect(codeOf(() => decodeUtf8(Uint8Array.from(b))), b.join(",")).toBe("BAD_METADATA");
  });
  it("round trips a long string across the decode chunk boundary", () => {
    const s = "ab€😀".repeat(3000);
    expect(decodeUtf8(encodeUtf8(s))).toBe(s);
  });
});
