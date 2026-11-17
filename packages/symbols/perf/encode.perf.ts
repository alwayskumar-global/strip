// R7.6: encode 1732 bytes at version 30, ECC L. Budget: median <= 5 ms.
import { expect, it } from "vitest";
import { encodeSymbol } from "../src/encode-symbol.js";
import { randomBytes, mulberry32 } from "../test/helpers/prng.js";
import { MACHINE, fmt, measure } from "./measure.js";
it("encode median is at most 5 ms for 1732 bytes at v30 L (R7.6)", async () => {
  const payload = randomBytes(mulberry32(1), 1732);
  const s = await measure(() => encodeSymbol(payload, { version: 30, ecc: "L" }));
  process.stdout.write(`[perf] encode v30 L 1732 B: ${fmt(s)} | budget 5 ms | ${MACHINE}\n`);
  expect(s.median).toBeLessThanOrEqual(5);
});
