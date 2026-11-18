// The history store: useSyncExternalStore(subscribe, getSnapshot). Memory only; nothing is persisted (R8.6).
import { useSyncExternalStore } from "react";
import { matchRoute, splitHref, type RouteId } from "./router.js";
export interface Location {
  path: string;
  search: string;
  hash: string;
}
const listeners = new Set<() => void>();
let snap: Location = { path: "/", search: "", hash: "" };
let started = false;
function read(): Location {
  const l = window.location;
  return { path: l.pathname, search: l.search, hash: l.hash };
}
function update(): void {
  const next = read();
  if (next.path === snap.path && next.search === snap.search && next.hash === snap.hash) return;
  snap = next;
  for (const f of listeners) f();
}
/** Unknown paths are replaced by "/" (R8.2). */
function normalise(): void {
  if (matchRoute(window.location.pathname) === null && !(__STRIP_GALLERY__ && window.location.pathname.startsWith("/__gallery/"))) {
    window.history.replaceState(null, "", "/");
  }
}
export function startRouter(): void {
  if (started) return;
  started = true;
  normalise();
  snap = read();
  window.addEventListener("popstate", () => {
    normalise();
    update();
  });
}
export function navigate(href: string, opts: { replace?: boolean } = {}): void {
  const { path, search, hash } = splitHref(href);
  const url = `${path}${search}${hash}`;
  if (opts.replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  update();
  if (hash !== "") document.getElementById(hash.slice(1))?.scrollIntoView();
}
const subscribe = (f: () => void): (() => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
export function useLocation(): Location {
  return useSyncExternalStore(subscribe, () => snap, () => snap);
}
export function useRoute(): RouteId {
  return matchRoute(useLocation().path) ?? "home";
}
