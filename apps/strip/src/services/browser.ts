// Browser edges the containers call: print, full screen, clipboard, media queries, visibility. Impure on purpose.
export interface PrintTarget {
  print(): void;
}
/** window.print() once; nothing is opened (R10.7, R10.11). */
export function printPage(win: PrintTarget = window): void {
  win.print();
}
/** `prefers-reduced-motion: reduce` (R3.9, R11.8). */
export const prefersReducedMotion = (win: Pick<Window, "matchMedia"> = window): boolean => win.matchMedia("(prefers-reduced-motion: reduce)").matches;
export async function enterFullscreen(doc: Document = document): Promise<void> {
  try {
    await doc.documentElement.requestFullscreen?.();
  } catch {
    /* refused: the full-screen state stays as the page layout */
  }
}
export async function exitFullscreen(doc: Document = document): Promise<void> {
  if (doc.fullscreenElement) await doc.exitFullscreen().catch(() => undefined);
}
/** Space starts or stops playback unless the focus is on another interactive control (R3.7). */
export function isSpaceTarget(el: Element | null): boolean {
  if (!el) return true;
  return !el.closest('button, a, input, select, textarea, summary, [role="button"]');
}
