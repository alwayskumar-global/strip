import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BANNED = /Math\.random|Date\.now|performance\.now|Math\.(?:log|sqrt|exp|pow)\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("purity of packages/codec/src (R6.2, R6.5)", () => {
  it("contains zero banned symbols", () => {
    const hits: string[] = [];
    for (const f of files(`${process.cwd()}/src`).filter((p) => /\.(ts|js|mjs)$/.test(p))) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (BANNED.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });
});
