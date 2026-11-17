import { DENSE_PERIOD, SOLITON_C, SOLITON_DELTA } from "./constants.js";
import type { SolitonParams } from "./soliton.js";

/** Format constants that shape which Blocks a repair packet covers. Internal; the barrel does not export it. */
export interface FormatParams extends SolitonParams {
  /** Dense period D; 0 means no dense packets. */
  readonly D: number;
}

export const DEFAULT_FORMAT: FormatParams = { c: SOLITON_C, delta: SOLITON_DELTA, D: DENSE_PERIOD };
