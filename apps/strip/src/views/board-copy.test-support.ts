// Test support only (never imported by app code): the static copy and ARIA text of a design board, for "verbatim" checks.
import { readFileSync } from "node:fs";
const ENTITIES: Record<string, string> = { "&amp;": "&", "&middot;": "·", "&hellip;": "…", "&rarr;": "→", "&larr;": "←", "&ndash;": "–", "&mdash;": "—", "&rsquo;": "’", "&lsquo;": "‘", "&ldquo;": "“", "&rdquo;": "”", "&times;": "×", "&nbsp;": "\u00a0", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&asymp;": "≈", "&ne;": "≠", "&rsaquo;": "›" };
const decode = (s: string): string => s.replace(/&[#\w]+;/g, (e) => ENTITIES[e] ?? e);
export function boardSource(file: string): string {
  const html = readFileSync(`${process.cwd()}/../../design/project/${file}`, "utf8");
  return html.slice(html.indexOf("</helmet>") + 9, html.indexOf("</x-dc>"));
}
const squash = (s: string): string => decode(s).replace(/\s+/g, " ").trim();
/** Text runs of the board that contain no template expression. */
export function boardTexts(file: string): string[] {
  return boardSource(file)
    .replace(/<!--[^]*?-->/g, "")
    .split(/<[^>]*>/)
    .map(squash)
    .filter((t) => t !== "" && !t.includes("{{"));
}
/** Static aria-label values of the board. */
export function boardAriaLabels(file: string): string[] {
  return [...boardSource(file).matchAll(/aria-label="([^"{]*)"/g)].map((m) => decode(m[1] as string));
}
/** Text content and attribute values of rendered markup, for substring checks. */
export function markupText(html: string): string {
  return html.split(/<[^>]*>/).map(squash).join(" ");
}
export const attrValues = (html: string, name: string): string[] => [...html.matchAll(new RegExp(`${name}="([^"]*)"`, "g"))].map((m) => decode(m[1] as string));
