// Normalised DOM tree used by the parity gate (design.md "DOM parity gate"). Self-contained on purpose:
// Playwright serialises the function and runs it in the page, so it must not reference anything outside its body.
export type NormNode = { tag: string; attrs: Record<string, string>; children: Array<NormNode | string> };
export function normalizeDom(): NormNode | null {
  const DROP_TAGS = new Set(["script", "style", "link", "noscript", "template"]);
  const DROP_CLASS = new Set(["page--m", "fs--m", "paper--letter"]);
  const root = document.querySelector(".strip");
  if (!root) return null;
  const walk = (el: Element, inCode: boolean): Array<NormNode | string> => {
    const out: Array<NormNode | string> = [];
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3) {
        const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
        if (t === "") continue;
        const last = out[out.length - 1];
        if (typeof last === "string") out[out.length - 1] = `${last} ${t}`;
        else out.push(t);
      } else if (n.nodeType === 1) {
        const c = n as Element;
        const tag = c.tagName.toLowerCase();
        if (DROP_TAGS.has(tag) || c.hasAttribute("data-addition")) continue;
        if (tag.includes("-")) {
          out.push(...walk(c, inCode)); // custom elements are unwrapped
          continue;
        }
        out.push(node(c, inCode));
      }
    }
    return out;
  };
  const node = (el: Element, inCode: boolean): NormNode => {
    const tag = el.tagName.toLowerCase();
    const isCode = inCode || (tag === "svg" && el.classList.contains("code"));
    const attrs: Record<string, string> = {};
    for (const a of Array.from(el.attributes).sort((x, y) => (x.name < y.name ? -1 : 1))) {
      const name = a.name;
      if (name === "style" || name.startsWith("data-dc") || name.startsWith("hint-") || name.startsWith("sc-") || name === "data-reactroot") continue;
      if (name === "checked" || name === "disabled") continue; // read from the DOM property below
      if (name === "tabindex" && a.value === "-1" && (tag === "h1" || tag === "h2")) continue;
      if (name === "class") {
        const toks = a.value.split(/\s+/).filter((t) => t !== "" && !DROP_CLASS.has(t)).sort();
        if (toks.length > 0) attrs["class"] = toks.join(" ");
        continue;
      }
      attrs[name] = inCode && name === "d" ? "*" : a.value;
    }
    if ((el as HTMLInputElement).checked === true) attrs["checked"] = "";
    if ((el as HTMLInputElement).disabled === true) attrs["disabled"] = "";
    if (isCode && tag === "path" && "d" in attrs) attrs["d"] = "*";
    const sorted: Record<string, string> = {};
    for (const k of Object.keys(attrs).sort()) sorted[k] = attrs[k] as string;
    return { tag, attrs: sorted, children: walk(el, isCode) };
  };
  return node(root, false);
}
