// The route table (design: Router). Titles are the boards' <title>, except Receive (Resolved question 41).
export type RouteId = "home" | "send" | "stream" | "paper" | "receive" | "about";
export const ROUTES: Readonly<Record<RouteId, { path: string; title: string }>> = {
  home: { path: "/", title: "Strip home" },
  send: { path: "/send", title: "Send step 1" },
  stream: { path: "/send/screen", title: "Send on screen" },
  paper: { path: "/send/paper", title: "Send on paper" },
  receive: { path: "/receive", title: "Receive" },
  about: { path: "/about", title: "About and privacy" },
};
export const ROUTE_IDS = Object.keys(ROUTES) as RouteId[];
