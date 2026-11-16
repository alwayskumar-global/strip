// Fails if a banned call appears in packages/*/src.
// All packages: Math.random, Date.now, performance.now.
// packages/codec also: Math.log, Math.sqrt, Math.exp, Math.pow (format-affecting code stays integer-only).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = /Math\.random|Date\.now|performance\.now/;
const CODEC_EXTRA = /Math\.(?:log|sqrt|exp|pow)\b/;
const rulesFor = (pkg) => (pkg === "codec" ? [BASE, CODEC_EXTRA] : [BASE]);

const hits = [];
const walk = (dir, rules) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, rules);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
      readFileSync(p, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (rules.some((re) => re.test(line))) hits.push(`${p}:${i + 1}: ${line.trim()}`);
        });
    }
  }
};

for (const pkg of readdirSync("packages")) {
  try {
    walk(join("packages", pkg, "src"), rulesFor(pkg));
  } catch {
    /* package without src */
  }
}
if (hits.length) {
  console.error("Purity violation (banned call in packages/*/src):\n" + hits.join("\n"));
  process.exit(1);
}
