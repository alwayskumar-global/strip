// Test support only (never imported by app code): the static copy and ARIA text of a design board, for "verbatim" checks.
import { readFileSync } from "node:fs";
const ENTITIES: Record<string, string> = { "&amp;": "&", "&middot;": "·", "&hellip;": "…", "&rarr;": "→", "&larr;": "←", "&ndash;": "–", "&mdash;": "—", "&rsquo;": "’", "&lsquo;": "‘", "&ldquo;": "“", "&rdquo;": "”", "&times;": "×", "&nbsp;": "\u00a0", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&asymp;": "≈", "&ne;": "≠", "&rsaquo;": "›" };
const decode = (s: string): string => s.replace(/&[#\w]+;/g, (e) => ENTITIES[e] ?? e);
/** Removes every `<sc-if value="{{name}}">` block whose name is false in `active` (nesting-aware). Names missing from `active` are kept. */
export function dropInactive(src: string, active: Readonly<Record<string, boolean>>): string {
  let out = "";
  let i = 0;
  const open = /<sc-if\s+value="\{\{\s*([\w.]+)\s*\}\}"[^>]*>/y;
  while (i < src.length) {
    open.lastIndex = i;
    const m = open.exec(src);
    if (m && active[m[1] as string] === false) {
      let depth = 1;
      let j = open.lastIndex;
      while (depth > 0) {
        const nextOpen = src.indexOf("<sc-if", j);
        const nextClose = src.indexOf("</sc-if>", j);
        if (nextClose === -1) throw new Error("unbalanced sc-if");
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          j = nextOpen + 6;
        } else {
          depth--;
          j = nextClose + 8;
        }
      }
      i = j;
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}
export function boardSource(file: string, active: Readonly<Record<string, boolean>> = {}): string {
  const html = readFileSync(`${process.cwd()}/../../design/project/${file}`, "utf8");
  return dropInactive(html.slice(html.indexOf("</helmet>") + 9, html.indexOf("</x-dc>")), active);
}
const squash = (s: string): string => decode(s).replace(/\s+/g, " ").trim();
/** Text runs of the board that contain no template expression. */
export function boardTexts(file: string, active: Readonly<Record<string, boolean>> = {}): string[] {
  return boardSource(file, active)
    .replace(/<!--[^]*?-->/g, "")
    .split(/<[^>]*>/)
    .map(squash)
    .filter((t) => t !== "" && !t.includes("{{"));
}
/** Static aria-label values of the board. */
export function boardAriaLabels(file: string, active: Readonly<Record<string, boolean>> = {}): string[] {
  return [...boardSource(file, active).matchAll(/aria-label="([^"{]*)"/g)].map((m) => decode(m[1] as string));
}
/** Text content and attribute values of rendered markup, for substring checks. */
export function markupText(html: string): string {
  return html.split(/<[^>]*>/).map(squash).join(" ");
}
export const attrValues = (html: string, name: string): string[] => [...html.matchAll(new RegExp(`${name}="([^"]*)"`, "g"))].map((m) => decode(m[1] as string));
