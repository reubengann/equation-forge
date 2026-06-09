import { describe, expect, it } from "vitest";
import { parseLatexToExpr } from "../latex/parseLatexToExpr";
import { toMathJson } from "./toMathJson";

function expr(latex: string) {
  return parseLatexToExpr(latex, { onError: "throw" });
}

describe("toMathJson", () => {
  it("maps arithmetic while substituting symbols with CE-safe names", () => {
    const result = toMathJson(expr(String.raw`x_0+2 \mu_s`));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(["Add", "__pdp0", ["Multiply", 2, "__pdp1"]]);
    expect(result.symbols.originalBySafe.get("__pdp0")).toBe("x_0");
    expect(result.symbols.originalBySafe.get("__pdp1")).toBe(String.raw`\mu_s`);
  });

  it("maps common functions and integrals with explicit differentials", () => {
    const result = toMathJson(expr(String.raw`\int x \sin(x)\,\mathrm{d}{x}`));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      "Integrate",
      ["Multiply", "__pdp0", ["Sin", "__pdp0"]],
      ["Limits", "__pdp0", "Nothing", "Nothing"],
    ]);
  });

  it("maps definite integrals with zero bounds", () => {
    const result = toMathJson(expr(String.raw`\int_{0}^{1} x^{2}\,\mathrm{d}{x}`));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      "Integrate",
      ["Power", "__pdp0", 2],
      ["Limits", "__pdp0", 0, 1],
    ]);
  });

  it("maps ordinary and partial derivative shapes to CE derivative forms", () => {
    const full = toMathJson(expr(String.raw`\frac{d}{dx} x^2`));
    const partial = toMathJson(expr(String.raw`\frac{\partial{s}}{\partial{T}}`));

    expect(full.ok).toBe(true);
    if (full.ok) expect(full.value).toEqual(["D", ["Power", "__pdp0", 2], "__pdp0"]);

    expect(partial.ok).toBe(true);
    if (partial.ok) expect(partial.value).toEqual(["PartialDerivative", "__pdp0", "__pdp1"]);
  });

  it("reports unsupported special-font expressions without throwing", () => {
    const result = toMathJson(expr(String.raw`\mathscr{H}`));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      reason: "unsupported_expr_kind",
      exprKind: "special_font",
    });
  });
});
