// Fails if a banned nondeterministic call appears in packages/*/src.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const banned = /Math\.random|Date\.now|performance\.now/;
const hits = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
      readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        if (banned.test(line)) hits.push(`${p}:${i + 1}: ${line.trim()}`);
      });
    }
  }
};
for (const pkg of readdirSync("packages")) {
  try {
    walk(join("packages", pkg, "src"));
  } catch {
    /* package without src */
  }
}
if (hits.length) {
  console.error("Purity violation (banned call in packages/*/src):\n" + hits.join("\n"));
  process.exit(1);
}
