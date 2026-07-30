import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MATH_ENTRY_MACROS } from "./mathEntryMacros";

describe("math entry macro icons", () => {
  it("renders the optimized inline SVG artwork for calculus macros", () => {
    const calculusMacros = MATH_ENTRY_MACROS.slice(0, 7);

    expect(calculusMacros).toHaveLength(7);
    calculusMacros.forEach((macro) => {
      const markup = renderToStaticMarkup(<>{macro.icon}</>);
      expect(markup).toContain("<svg");
      expect(markup).not.toContain("□");
    });
  });
});
