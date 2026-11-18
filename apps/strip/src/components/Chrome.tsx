// The shared page chrome of the boards: header.nav with the brand and the three primary links (R8.4).
import type { ReactNode } from "react";
export type NavId = "send" | "receive" | "about" | null;
const LINKS: ReadonlyArray<{ id: Exclude<NavId, null>; href: string; label: string }> = [
  { id: "send", href: "/send", label: "Send" },
  { id: "receive", href: "/receive", label: "Receive" },
  { id: "about", href: "/about", label: "About" },
];
export function Nav({ current, noPrint = false }: { current: NavId; noPrint?: boolean }): ReactNode {
  return (
    <header className={noPrint ? "nav no-print" : "nav"}>
      <a className="brand" href="/" aria-label="Strip home">
        <svg className="brand__mark" viewBox="0 0 28 28" aria-hidden="true">
          <rect x="3" y="2" width="22" height="24" />
          <path d="M8 8h12M8 12h7M8 16h12M8 20h5" />
        </svg>
        <span>Strip</span>
      </a>
      <nav className="nav__links" aria-label="Primary">
        {LINKS.map((l) => (
          <a key={l.id} className="nav__link" href={l.href} {...(current === l.id ? { "aria-current": "page" as const } : {})}>
            {l.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
