// When a click on an anchor is handled by the router (R8.3). Everything else is left to the browser.
import { matchRoute } from "./router.js";
export interface ClickLike {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}
export interface AnchorLike {
  href: string; // absolute, as the browser resolves it
  target: string;
  download: boolean;
  rel: string;
}
export function shouldIntercept(e: ClickLike, a: AnchorLike, origin: string): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.target !== "" && a.target !== "_self") return false;
  if (a.download || /(^|\s)external(\s|$)/.test(a.rel)) return false;
  let u: URL;
  try {
    u = new URL(a.href);
  } catch {
    return false;
  }
  if (u.origin !== origin) return false;
  return matchRoute(u.pathname) !== null;
}
