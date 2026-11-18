// One click listener on the document: same-origin clicks on known routes become history navigation (R8.3).
// After a navigation the page scrolls to the top and focuses the main heading (R17.4); the initial load focuses nothing.
import { focusMainHeading } from "./focus.js";
import { shouldIntercept } from "./links.js";
import { navigate } from "./router-store.js";
export function installLinkInterception(doc: Document = document): () => void {
  const onClick = (e: MouseEvent): void => {
    const a = (e.target as Element | null)?.closest?.("a");
    if (!a) return;
    if (!shouldIntercept(e, { href: a.href, target: a.target, download: a.hasAttribute("download"), rel: a.rel }, location.origin)) return;
    e.preventDefault();
    const u = new URL(a.href);
    const samePage = u.pathname === location.pathname && u.search === location.search;
    navigate(`${u.pathname}${u.search}${u.hash}`);
    if (samePage && u.hash !== "") return; // an in-page anchor only scrolls
    window.scrollTo(0, 0);
    requestAnimationFrame(() => focusMainHeading(doc));
  };
  doc.addEventListener("click", onClick);
  return () => doc.removeEventListener("click", onClick);
}
