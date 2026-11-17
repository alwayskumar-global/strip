// fitScale (R3.5, R3.6): the largest integer pixels-per-module that fits a box.
import { SymbolError } from "./errors.js";
import type { SymbolMatrix } from "./matrix.js";

export type FitBox = { width: number; height: number };
export type FitResult = { ppm: number; width: number; height: number };

export function fitScale(m: Pick<SymbolMatrix, "size">, quietZone: number, box: FitBox): FitResult {
  if (typeof m !== "object" || m === null || !Number.isInteger(m.size) || m.size < 21) {
    throw new SymbolError("INVALID_INPUT", "matrix must have an integer size >= 21");
  }
  if (!Number.isInteger(quietZone) || quietZone < 0) throw new SymbolError("INVALID_INPUT", "quietZone must be an integer >= 0");
  if (typeof box !== "object" || box === null || !Number.isFinite(box.width) || !Number.isFinite(box.height) || box.width < 0 || box.height < 0) {
    throw new SymbolError("INVALID_INPUT", "box must have finite non-negative width and height");
  }
  const modules = m.size + 2 * quietZone;
  const ppm = Math.floor(Math.min(box.width, box.height) / modules);
  if (ppm < 1) return { ppm: 0, width: 0, height: 0 };
  return { ppm, width: modules * ppm, height: modules * ppm };
}
