import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const root = process.cwd();
const notices = readFileSync(`${root}/../../apps/strip/public/THIRD_PARTY_NOTICES`, "utf8");
const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf8")) as { dependencies: Record<string, string> };
describe("THIRD_PARTY_NOTICES (R15)", () => {
  // Feature: symbols, Property 19: the static THIRD_PARTY_NOTICES names qr 0.7.2 (MIT), zxing-wasm 3.1.7 (MIT), zxing-cpp (Apache-2.0) and the zxing-wasm C++ glue (Apache-2.0), each with version and licence, contains the Apache-2.0 text, and does not mention zint
  it("P19: names each shipped component with version and licence, contains the Apache-2.0 text, does not mention the unshipped one", () => {
    const qrVersion = pkg.dependencies["qr"] as string;
    const zxVersion = pkg.dependencies["zxing-wasm"] as string;
    expect(notices).toMatch(new RegExp(`qr ${qrVersion.replace(/\./g, "\\.")}\\s+MIT\\b`));
    expect(notices).toMatch(new RegExp(`zxing-wasm ${zxVersion.replace(/\./g, "\\.")}\\s+MIT\\b`));
    expect(notices).toMatch(/zxing-cpp \(commit [0-9a-f]{40}[^)]*\)\s+Apache-2\.0/);
    expect(notices).toMatch(/zxing-wasm C\+\+ glue[^]*?Apache-2\.0/);
    expect(notices).toContain("Apache License");
    expect(notices).toContain("Version 2.0, January 2004");
    expect(notices).toContain("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION");
    expect(notices).toContain("END OF TERMS AND CONDITIONS");
    expect(notices).toContain("Permission is hereby granted, free of charge");
    expect(notices).toContain("Paul Miller");
    expect(notices).toContain("Ze-Zheng Wu");
    expect(notices.toLowerCase()).not.toContain("zint");
  });
  it("R15.3: records the NOTICE-file verification result for zxing-cpp", () => {
    expect(notices).toContain("NOTICE file check");
    expect(notices).toMatch(/no NOTICE file/);
  });
  it("is a committed static file under apps/strip/public (never generated)", () => {
    expect(notices.length).toBeGreaterThan(10_000);
  });
});
