// Overhead calibration on the real encoder and decoder. Seeded through the codec's own PRNG, so a run
// is deterministic. Library plus a small CLI parser; the vitest entry (calibrate.perf.ts) runs it.
//
//   M1 late join:      random subset of repair packets (seq K..5K-1, 4K cap) until complete -> packets needed
//   M2 cold start:     stream from seq 0, each packet lost with probability 0.30 -> packets received
//   M3 page mode:      same stream with loss 0.05 -> stream position at completion; R = position - K
//
// Factors are the per-row table quantile (0.995 by default, 0.999 for the small-K rows; properties assert 0.99 so sampling noise has margin),
// rounded up to permille. The 0.99 quantile is reported alongside.
import { createDecoderWith } from "../src/decoder.js";
import { encodeWith } from "../src/encoder.js";
import { DEFAULT_FORMAT, type FormatParams } from "../src/format.js";
import { ceilDiv } from "../src/header.js";
import { Prng } from "../src/prng.js";

export const CALIBRATION_SEED = 0x5ca11b00;
export const TABLE_KS = [10, 25, 50, 100, 250, 500, 1000, 2000, 4000, 8000, 16384] as const;
export const PACKET_SIZE = 62; // blockSize 32
const BLOCK = 32;
const RECORD = 41; // metadata record for name "a" and empty MIME
/** next() < threshold means lost: floor(0.30 * 2^32) and floor(0.05 * 2^32) */
export const LOSS_30 = 1288490189;
export const LOSS_05 = 214748365;

export interface CalibrationOptions {
  readonly format: FormatParams;
  readonly Ks: readonly number[];
  /** Trials per K. */
  readonly samples: Readonly<Record<number, number>>;
  /** Table quantile per K (default 0.995). A high quantile needs a large N: 0.999 from N <= 300 is the sample maximum. */
  readonly quantiles?: Readonly<Record<number, number>>;
  readonly seed?: number;
  /** Optional progress callback, called after each K. */
  readonly log?: (line: string) => void;
}

export interface Quantiles {
  readonly q99: number;
  /** The per-row table quantile (0.995 or 0.999). */
  readonly qTable: number;
  /** Observed fraction of trials at or below the table value. */
  readonly rateTable: number;
  readonly wilsonTable: number;
}

export interface KResult {
  readonly K: number;
  readonly N: number;
  /** The quantile the table value is taken at. */
  readonly quantile: number;
  /** Packets needed in M1. */
  readonly late: Quantiles;
  /** Packets received in M2. */
  readonly cold: Quantiles;
  /** Stream position at completion in M3. */
  readonly page: Quantiles;
  readonly fLatePermille: number;
  readonly fColdPermille: number;
  readonly R: number;
  readonly fLate99Permille: number;
  readonly fCold99Permille: number;
  readonly R99: number;
}

export function wilsonLower(successes: number, n: number): number {
  if (n === 0) return 0;
  const z = 1.96;
  const p = successes / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
}

/** q-quantile of an ascending array: x[ceil(q N) - 1]. May be Infinity. */
function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] as number;
}

function summarize(values: number[], tableQuantile: number): Quantiles {
  const sorted = [...values].sort((a, b) => a - b);
  const qTable = quantile(sorted, tableQuantile);
  const within = sorted.filter((v) => v <= qTable).length;
  return { q99: quantile(sorted, 0.99), qTable, rateTable: within / sorted.length, wilsonTable: wilsonLower(within, sorted.length) };
}

function shuffle<T>(items: T[], prng: Prng): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = prng.bounded(i + 1);
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
}

interface TrialResult {
  late: number;
  cold: number;
  page: number;
}

async function runTrial(K: number, trial: number, format: FormatParams, seed: number): Promise<TrialResult> {
  const stream = (salt: number) => new Prng((seed ^ K) >>> 0, trial * 4 + salt);
  const payloadRng = stream(0);
  const bytes = Uint8Array.from({ length: K * BLOCK - RECORD }, () => payloadRng.next() >>> 24);
  const enc = await encodeWith({ bytes, name: "a", mime: "" }, { packetSize: PACKET_SIZE }, { format });
  if (enc.K !== K) throw new Error(`calibration payload gave K=${enc.K}, expected ${K}`);
  const cache: Uint8Array[] = [];
  const packet = (seq: number): Uint8Array => {
    while (cache.length <= seq) cache.push(enc.next());
    return cache[seq] as Uint8Array;
  };
  const verify = (d: ReturnType<typeof createDecoderWith>): void => {
    const got = d.result().payload;
    if (got.length !== bytes.length || got.some((v, i) => v !== bytes[i])) {
      throw new Error(`COUNTEREXAMPLE: decoder completed with wrong bytes (K=${K}, trial=${trial})`);
    }
  };

  // M1
  const order: number[] = [];
  for (let s = K; s < 5 * K; s++) order.push(s);
  shuffle(order, stream(1));
  const d1 = createDecoderWith({}, format);
  let late = Number.POSITIVE_INFINITY;
  for (let i = 0; i < order.length; i++) {
    const s = await d1.push(packet(order[i] as number));
    if (s.progress.complete) {
      late = i + 1;
      verify(d1);
      break;
    }
  }

  // M2 and M3
  const lossy = async (threshold: number, rng: Prng): Promise<{ received: number; position: number }> => {
    const d = createDecoderWith({}, format);
    let received = 0;
    for (let seq = 0; seq < 20 * K; seq++) {
      if (rng.next() < threshold) continue;
      received++;
      const s = await d.push(packet(seq));
      if (s.progress.complete) {
        verify(d);
        return { received, position: seq + 1 };
      }
    }
    return { received: Number.POSITIVE_INFINITY, position: Number.POSITIVE_INFINITY };
  };
  const m2 = await lossy(LOSS_30, stream(2));
  const m3 = await lossy(LOSS_05, stream(3));
  return { late, cold: m2.received, page: m3.position };
}

export async function calibrateK(K: number, N: number, format: FormatParams, seed: number, tableQuantile = 0.995): Promise<KResult> {
  const late: number[] = [];
  const cold: number[] = [];
  const page: number[] = [];
  for (let t = 0; t < N; t++) {
    const r = await runTrial(K, t, format, seed);
    late.push(r.late);
    cold.push(r.cold);
    page.push(r.page);
  }
  const L = summarize(late, tableQuantile);
  const C = summarize(cold, tableQuantile);
  const P = summarize(page, tableQuantile);
  const permille = (count: number): number => ceilDiv(count * 1000, K);
  return {
    K,
    N,
    quantile: tableQuantile,
    late: L,
    cold: C,
    page: P,
    fLatePermille: permille(L.qTable),
    fColdPermille: permille(C.qTable),
    R: Math.max(0, P.qTable - K),
    fLate99Permille: permille(L.q99),
    fCold99Permille: permille(C.q99),
    R99: Math.max(0, P.q99 - K),
  };
}

export async function calibrate(options: CalibrationOptions): Promise<KResult[]> {
  const out: KResult[] = [];
  for (const K of options.Ks) {
    const N = options.samples[K];
    if (N === undefined) throw new Error(`no sample count for K=${K}`);
    const t0 = process.hrtime.bigint();
    out.push(await calibrateK(K, N, options.format, options.seed ?? CALIBRATION_SEED, options.quantiles?.[K] ?? 0.995));
    options.log?.(`K=${K} N=${N} done in ${(Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1)} s`);
  }
  return out;
}

/** An infinite quantile means the claim could not be met at all: calibration must fail. */
export function failingK(results: readonly KResult[]): number | undefined {
  for (const r of results) {
    if (![r.late.qTable, r.cold.qTable, r.page.qTable].every(Number.isFinite)) return r.K;
  }
  return undefined;
}

export interface TableFile {
  readonly formatVersion: 1;
  readonly c: readonly [number, number];
  readonly delta: readonly [number, number];
  readonly D: number;
  /** N is the number of calibration trials behind the row and quantile the table quantile of that row. */
  readonly rows: ReadonlyArray<{ K: number; N: number; quantile: string; fLatePermille: number; fColdPermille: number; R: number }>;
}

export function toTableFile(format: FormatParams, results: readonly KResult[]): TableFile {
  return {
    formatVersion: 1,
    c: format.c,
    delta: format.delta,
    D: format.D,
    rows: results.map((r) => ({ K: r.K, N: r.N, quantile: String(r.quantile), fLatePermille: r.fLatePermille, fColdPermille: r.fColdPermille, R: r.R })),
  };
}

const pct = (x: number): string => x.toFixed(4);
const f2 = (permille: number): string => (permille / 1000).toFixed(3);

export function renderTable(format: FormatParams, results: readonly KResult[]): string {
  const lines = [
    `c=${format.c[0]}/${format.c[1]} delta=${format.delta[0]}/${format.delta[1]} D=${format.D}  (loss: M2 0.30, M3 0.05; table value = per-row quantile, rounded up to permille)`,
    "   K     N   q | f_late 0.99  table (wilson) | f_cold 0.99  table (wilson) |  R 0.99  table (wilson)",
  ];
  for (const r of results) {
    lines.push(
      `${String(r.K).padStart(5)} ${String(r.N).padStart(5)} ${String(r.quantile).padStart(5)} | ${f2(r.fLate99Permille).padStart(10)} ${f2(r.fLatePermille).padStart(6)} (${pct(r.late.wilsonTable)}) | ${f2(r.fCold99Permille).padStart(10)} ${f2(r.fColdPermille).padStart(6)} (${pct(r.cold.wilsonTable)}) | ${String(r.R99).padStart(6)} ${String(r.R).padStart(6)} (${pct(r.page.wilsonTable)})`,
    );
  }
  return lines.join("\n");
}

// ---- CLI argument parsing -------------------------------------------------------------------

export function parseRational(text: string): [number, number] {
  const slash = text.split("/");
  if (slash.length === 2) {
    const n = Number(slash[0]);
    const d = Number(slash[1]);
    if (Number.isInteger(n) && Number.isInteger(d) && n > 0 && d > 0) return [n, d];
  } else if (/^\d+(\.\d+)?$/.test(text)) {
    const [whole = "0", frac = ""] = text.split(".");
    let n = Number(whole + frac);
    let d = 10 ** frac.length;
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const g = gcd(n, d);
    n /= g;
    d /= g;
    if (n > 0) return [n, d];
  }
  throw new Error(`cannot parse rational "${text}" (use n/d or a decimal)`);
}

export interface CliArgs {
  readonly format: FormatParams;
  readonly Ks: readonly number[];
  readonly samples: Readonly<Record<number, number>>;
  readonly quantiles: Readonly<Record<number, number>>;
  readonly write: boolean;
  readonly merge: boolean;
  readonly seed: number;
}

function parseMap(text: string, Ks: readonly number[], name: string): Record<number, number> {
  const out: Record<number, number> = {};
  if (text.includes(":")) {
    for (const part of text.split(",")) {
      const [k, v] = part.split(":").map(Number);
      if (!Number.isInteger(k) || v === undefined || !Number.isFinite(v)) throw new Error(`bad --${name} entry "${part}"`);
      out[k as number] = v;
    }
  } else {
    for (const k of Ks) out[k] = Number(text);
  }
  return out;
}

/**
 * Parse `--c 1/10 --delta 1/2 --D 3 --K 50,100 --samples 200 | 50:1000,500:300 --quantile 0.995 | 10:0.999,25:0.999
 * [--write] [--merge] [--seed n]`.
 */
export function parseArgs(text: string): CliArgs {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  const flags = new Map<string, string>();
  let write = false;
  let merge = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as string;
    if (t === "--write") write = true;
    else if (t === "--merge") merge = true;
    else if (t.startsWith("--")) {
      const v = tokens[++i];
      if (v === undefined) throw new Error(`missing value for ${t}`);
      flags.set(t.slice(2), v);
    } else throw new Error(`unexpected argument "${t}"`);
  }
  const Ks = (flags.get("K") ?? TABLE_KS.join(",")).split(",").map(Number);
  if (Ks.some((k) => !Number.isInteger(k) || k < 2)) throw new Error("--K must be a list of integers >= 2");
  const samples = parseMap(flags.get("samples") ?? "1000", Ks, "samples");
  const quantiles = parseMap(flags.get("quantile") ?? "0.995", Ks, "quantile");
  for (const q of Object.values(quantiles)) if (!(q > 0 && q < 1)) throw new Error("--quantile values must be in (0, 1)");
  const dText = flags.get("D") ?? String(DEFAULT_FORMAT.D);
  const D = dText === "none" ? 0 : Number(dText);
  if (!Number.isInteger(D) || D < 0) throw new Error("--D must be an integer >= 0 (0 or none = no dense packets)");
  return {
    format: { c: parseRational(flags.get("c") ?? "1/10"), delta: parseRational(flags.get("delta") ?? "1/2"), D },
    Ks,
    samples,
    quantiles,
    write,
    merge,
    seed: flags.has("seed") ? Number(flags.get("seed")) : CALIBRATION_SEED,
  };
}

/**
 * Replace the rows of `existing` for the recalibrated K values and keep every other row untouched.
 * Rows of an older table without a per-row quantile get the old top-level quantile.
 */
export function mergeTable(existingJson: string, fresh: TableFile): TableFile {
  const old = JSON.parse(existingJson) as {
    c: [number, number];
    delta: [number, number];
    D: number;
    quantile?: string;
    rows: Array<{ K: number; N: number; quantile?: string; fLatePermille: number; fColdPermille: number; R: number }>;
  };
  if (JSON.stringify([old.c, old.delta, old.D]) !== JSON.stringify([fresh.c, fresh.delta, fresh.D])) {
    throw new Error("--merge: the existing table was calibrated with different c, delta or D");
  }
  const byK = new Map(old.rows.map((r) => [r.K, { ...r, quantile: r.quantile ?? old.quantile ?? "0.995" }]));
  for (const r of fresh.rows) byK.set(r.K, r);
  const rows = [...byK.values()].sort((a, b) => a.K - b.K).map((r) => ({ K: r.K, N: r.N, quantile: r.quantile, fLatePermille: r.fLatePermille, fColdPermille: r.fColdPermille, R: r.R }));
  return { formatVersion: 1, c: fresh.c, delta: fresh.delta, D: fresh.D, rows };
}

export interface CliOutput {
  readonly text: string;
  readonly table: TableFile;
  readonly results: readonly KResult[];
}

/**
 * Run calibration for CLI-style arguments. Writes through `writer` only with --write and only when the
 * resulting table covers every grid K (with --merge, the rows of `existing` that were not recalibrated
 * count); fails (throws) without writing when any quantile is infinite.
 */
export async function runCli(
  args: string,
  writer?: (json: string) => void,
  run: (options: CalibrationOptions) => Promise<KResult[]> = calibrate,
  log?: (line: string) => void,
  existing?: string,
): Promise<CliOutput> {
  const a = parseArgs(args);
  const results = await run({ format: a.format, Ks: a.Ks, samples: a.samples, quantiles: a.quantiles, seed: a.seed, ...(log ? { log } : {}) });
  const bad = failingK(results);
  if (bad !== undefined) throw new Error(`calibration failed: an infinite quantile at K=${bad}; nothing written`);
  const fresh = toTableFile(a.format, results);
  let table = fresh;
  if (a.merge) {
    if (existing === undefined) throw new Error("--merge needs an existing table");
    table = mergeTable(existing, fresh);
  }
  if (a.write) {
    if (TABLE_KS.some((k) => !table.rows.some((r) => r.K === k))) throw new Error("--write needs every table K; refusing to write a partial table");
    if (!writer) throw new Error("--write needs a writer");
    writer(JSON.stringify(table, null, 2) + "\n");
  }
  return { text: renderTable(a.format, results), table, results };
}
