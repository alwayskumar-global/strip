// Every href the boards contain, mapped to its app target (design: Router, how the design hrefs map).
export type HrefTarget = { kind: "route"; to: string } | { kind: "hash"; to: string } | { kind: "external"; to: string } | { kind: "dropped" };
const ROUTE_FILES: Readonly<Record<string, string>> = {
  "Home.dc.html": "/",
  "Send.dc.html": "/send",
  "SendScreen.dc.html": "/send/screen",
  "SendScreenFull.dc.html": "/send/screen", // click handler sets the fullScreen state; Exit full screen uses SendScreen.dc.html
  "SendPaper.dc.html": "/send/paper",
  "Receive.dc.html": "/receive",
  "About.dc.html": "/about",
};
export function mapHref(href: string): HrefTarget {
  if (href === "strip.css") return { kind: "dropped" }; // stylesheet link of the board shell
  if (href.startsWith("https://fonts.googleapis.com/")) return { kind: "dropped" };
  if (href.startsWith("https://")) return { kind: "external", to: href };
  if (href.startsWith("/THIRD_PARTY_NOTICES")) return { kind: "external", to: href };
  if (href.startsWith("#")) return { kind: "hash", to: href };
  const to = ROUTE_FILES[href];
  return to === undefined ? { kind: "dropped" } : { kind: "route", to };
}
