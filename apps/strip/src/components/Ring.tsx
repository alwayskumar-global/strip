// The progress ring of the Receive board. The only component that sets a `style` (a CSSOM property, allowed by the CSP):
// strip.css hard-codes `stroke-dasharray: 1.8 .69` for 111 packets, so one tick per source packet is computed from K here.
import type { CSSProperties, ReactNode } from "react";
const R = 44;
const CIRCUMFERENCE = 2 * Math.PI * R;
/** Arc length of one tick for K source packets. */
export const tick = (k: number): number => CIRCUMFERENCE / k;
/** The board's arc path for a percent: empty at 0, the full circle at 100. */
export function arc(p: number): string {
  if (p <= 0) return "";
  if (p >= 100) return "M50 6A44 44 0 1 1 49.99 6";
  const t = (p / 100) * 2 * Math.PI;
  return `M50 6A44 44 0 ${p > 50 ? 1 : 0} 1 ${(50 + R * Math.sin(t)).toFixed(2)} ${(50 - R * Math.cos(t)).toFixed(2)}`;
}
/** stroke-dasharray for K ticks: 72.3% drawn, 27.7% gap (the board's 1.8 and .69 of 2.49 at K = 111). */
export function dash(k: number): string {
  const t = tick(Math.max(1, k));
  return `${(t * 0.723).toFixed(4)} ${(t * 0.277).toFixed(4)}`;
}
export function Ring({ pct, cls, total }: { pct: number; cls: string; total: number }): ReactNode {
  const style: CSSProperties = { strokeDasharray: dash(total) };
  return (
    <div className={`ring ${cls}`} role="img" aria-label={`Progress ${pct} percent`}>
      <svg className="ring__svg" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="ring__track" cx="50" cy="50" r="44" style={style} />
        <path className="ring__bar" d={arc(pct)} style={style} />
      </svg>
      <div className="ring__label">
        <span>{pct}</span>
        <span className="ring__unit">%</span>
      </div>
    </div>
  );
}
