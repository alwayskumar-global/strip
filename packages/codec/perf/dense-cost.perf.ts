// pnpm --filter @strip/codec perf:dense-cost   (D from env DENSE_D, default 4)
import { it } from "vitest";
import { measureDenseNext, ONE_MIB, renderDenseCost, THIRTY_TWO_MIB_PAYLOAD } from "./dense-cost.js";

it("dense next() cost", async () => {
  const D = Number(process.env["DENSE_D"] ?? "4");
  process.stdout.write(renderDenseCost(await measureDenseNext(ONE_MIB, D), "1 MiB") + "\n");
  process.stdout.write(renderDenseCost(await measureDenseNext(THIRTY_TWO_MIB_PAYLOAD, D), "32 MiB (informational)") + "\n");
}, 3600 * 1000);
