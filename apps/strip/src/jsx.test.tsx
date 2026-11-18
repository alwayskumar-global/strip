import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
describe("JSX toolchain (R22.7)", () => {
  it("compiles TSX through Vite's own transform and renders to static markup in Node", () => {
    expect(renderToStaticMarkup(<div className="x">a</div>)).toBe('<div class="x">a</div>');
  });
});
