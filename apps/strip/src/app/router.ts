// Pure routing (no window): matching, titles and the nav aria-current rule (R8.2, R8.4, R8.7).
import { ROUTES, ROUTE_IDS, type RouteId } from "../state/routes.js";
export type { RouteId } from "../state/routes.js";
export type NavLink = "send" | "receive" | "about";

/** Exact match on the path; a trailing slash is ignored; query and hash never reach this function. */
export function matchRoute(pathname: string): RouteId | null {
  let p = pathname;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  for (const id of ROUTE_IDS) if (ROUTES[id].path === p) return id;
  return null;
}
export const titleOf = (id: RouteId): string => ROUTES[id].title;
export const pathOf = (id: RouteId): string => ROUTES[id].path;
/** Which primary nav link carries aria-current: none on Home; stream and paper belong to Send. */
export function navLinkCurrent(id: RouteId): NavLink | null {
  if (id === "home") return null;
  if (id === "stream" || id === "paper" || id === "send") return "send";
  return id;
}
/** Split "/about#limits?x" style hrefs into path, search and hash. */
export function splitHref(href: string): { path: string; search: string; hash: string } {
  const h = href.indexOf("#");
  const hash = h >= 0 ? href.slice(h) : "";
  const rest = h >= 0 ? href.slice(0, h) : href;
  const q = rest.indexOf("?");
  return { path: q >= 0 ? rest.slice(0, q) : rest, search: q >= 0 ? rest.slice(q) : "", hash };
}
