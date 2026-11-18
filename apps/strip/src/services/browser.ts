// Browser edges the containers call: print, full screen, clipboard, media queries, visibility. Impure on purpose.
export interface PrintTarget {
  print(): void;
}
/** window.print() once; nothing is opened (R10.7, R10.11). */
export function printPage(win: PrintTarget = window): void {
  win.print();
}
