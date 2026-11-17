// pnpm --filter @strip/codec perf:sweep   (writes perf/out/sweep.txt and perf/out/sweep.json, git-ignored)
import { mkdirSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { renderSweep, runSweep } from "./sweep.js";

it("sweep", async () => {
  const sweep = await runSweep({ log: (l) => process.stdout.write(l + "\n") });
  const text = renderSweep(sweep);
  const dir = `${process.cwd()}/perf/out`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/sweep.txt`, text + "\n");
  writeFileSync(`${dir}/sweep.json`, JSON.stringify(sweep, (_k, v: unknown) => (v === Number.POSITIVE_INFINITY ? "Infinity" : v), 2) + "\n");
  process.stdout.write(text + "\n");
}, 24 * 3600 * 1000);
