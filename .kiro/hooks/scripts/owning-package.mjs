// Reads hook JSON from stdin, finds the owning workspace package of the saved
// file, then runs typecheck and tests for it. Falls back to all packages.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const strings = [];
const walk = (v) => {
  if (typeof v === "string") strings.push(v);
  else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === "object") Object.values(v).forEach(walk);
};
try {
  walk(JSON.parse(readFileSync(0, "utf8")));
} catch {
  /* no or invalid stdin: fall back to all packages */
}

const names = { codec: "@strip/codec", symbols: "@strip/symbols", strip: "@strip/app" };
let filter = null;
for (const s of strings) {
  const m = s.match(/(?:packages|apps)\/(codec|symbols|strip)\//);
  if (m) {
    filter = names[m[1]];
    break;
  }
}

const target = filter ? ["--filter", filter] : ["-r"];
let status = 0;
for (const script of ["typecheck", "test"]) {
  const r = spawnSync("pnpm", [...target, "--if-present", script], { stdio: "inherit" });
  if (r.status !== 0) status = r.status ?? 1;
}
process.exit(status);
