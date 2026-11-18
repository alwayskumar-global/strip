import { describe, expect, it } from "vitest";
import { focusMainHeading, type FocusableElement } from "./focus.js";
const el = () => {
  const log: string[] = [];
  const e: FocusableElement = { setAttribute: (n, v) => void log.push(`${n}=${v}`), focus: () => void log.push("focus") };
  return { e, log };
};
describe("focus after navigation (R17.4)", () => {
  it("focuses the main heading and sets tabindex -1 at runtime", () => {
    const h1 = el();
    expect(focusMainHeading({ querySelector: (s) => (s === "main h1" ? h1.e : null) })).toBe(true);
    expect(h1.log).toEqual(["tabindex=-1", "focus"]);
  });
  it("falls back to the alert heading, and reports false when there is none", () => {
    const h2 = el();
    expect(focusMainHeading({ querySelector: (s) => (s === '[role="alert"] h2' ? h2.e : null) })).toBe(true);
    expect(focusMainHeading({ querySelector: () => null })).toBe(false);
  });
});
