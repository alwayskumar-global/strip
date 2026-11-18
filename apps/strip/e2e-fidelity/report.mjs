// Prints the fidelity table (per target: pixel diff %, DOM parity) from .fidelity/results after a test:fidelity run.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../.fidelity/results/", import.meta.url));
const rows = new Map();
for (const f of readdirSync(dir)) {
  const j = JSON.parse(readFileSync(dir + f, "utf8"));
  const r = rows.get(j.id) ?? { id: j.id };
  if (f.endsWith(".pixel.json")) Object.assign(r, { pixels: j.pixels, percent: j.percent });
  else r.parity = j.parity;
  rows.set(j.id, r);
}
console.log("| target | pixel diff % | DOM parity |\n|---|---|---|");
for (const r of [...rows.values()].sort((a, b) => a.id.localeCompare(b.id))) console.log(`| ${r.id} | ${r.percent === undefined ? "skipped" : `${r.percent.toFixed(3)} (${r.pixels} px)`} | ${r.parity ?? "skipped"} |`);
console.log(`\n${rows.size} targets`);
