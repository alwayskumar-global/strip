// Send on paper: pagination, labels, session ids and the preview reducer (design: State machines (c), R4, R10). Pure.
import { PER_PAGE } from "../limits.js";
export interface TilePlan {
  /** Zero-based index into the T Packets. */
  index: number;
  /** "P{p}·{ii}" */
  label: string;
  /** "{g}/{T}" */
  of: string;
}
export interface PagePlan {
  page: number;
  tiles: TilePlan[];
}
export const pageCount = (T: number): number => Math.ceil(T / PER_PAGE);
const two = (i: number): string => (i < 10 ? `0${i}` : `${i}`);
/** Splits T Packets into ceil(T / 9) pages in sequence order; labels P{p}·{ii} and captions {g}/{T}. */
export function paginate(T: number): PagePlan[] {
  const pages: PagePlan[] = [];
  for (let p = 1; p <= pageCount(T); p++) {
    const tiles: TilePlan[] = [];
    for (let i = 1; i <= PER_PAGE; i++) {
      const g = (p - 1) * PER_PAGE + i;
      if (g > T) break;
      tiles.push({ index: g - 1, label: `P${p}·${two(i)}`, of: `${g}/${T}` });
    }
    pages.push({ page: p, tiles });
  }
  return pages;
}
/** The 4 uppercase hex digits shown for a Session_Id (its high 16 bits). */
export const sessionShort = (id: number): string => ((id >>> 16) & 0xffff).toString(16).toUpperCase().padStart(4, "0");
/** Two Session_Shorts shown side by side: 8 digits each when the 4-digit forms are equal but the ids differ (R4.8). */
export function sessionShorts(a: number, b: number): [string, string] {
  const sa = sessionShort(a);
  const sb = sessionShort(b);
  if (sa !== sb || a === b) return [sa, sb];
  const full = (n: number): string => (n >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return [full(a), full(b)];
}
export interface PaperUi {
  page: number;
  N: number;
}
export type PaperEvent = { t: "PREV" } | { t: "NEXT" } | { t: "PRINT" } | { t: "SET_N"; N: number };
export function reducePaper(s: PaperUi, ev: PaperEvent): { state: PaperUi; effects: Array<"PRINT"> } {
  switch (ev.t) {
    case "PREV":
      return { state: s.page > 1 ? { ...s, page: s.page - 1 } : s, effects: [] };
    case "NEXT":
      return { state: s.page < s.N ? { ...s, page: s.page + 1 } : s, effects: [] };
    case "PRINT":
      return { state: s, effects: ["PRINT"] };
    case "SET_N":
      return { state: { N: ev.N, page: Math.min(s.page, Math.max(1, ev.N)) }, effects: [] };
  }
}
