// Vitest entry so the calibration can be run as a script:
//   CAL_ARGS="--c 1/10 --delta 1/2 --D 4 --K 50,100,500 --samples 1000" pnpm --filter @strip/codec perf:calibrate
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { runCli } from "./calibrate.js";

it("calibrate", async () => {
  const out = await runCli(process.env["CAL_ARGS"] ?? "", (json) => writeFileSync(`${process.cwd()}/src/overhead-table.json`, json));
  process.stdout.write(out.text + "\n");
}, 24 * 3600 * 1000);
