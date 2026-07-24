import { describe, expect, it } from "vitest";
import { parseLatexToExpr } from "../latex/parseLatexToExpr";
import { toAlgebrite } from "./toAlgebrite";

function expr(latex: string) {
  return parseLatexToExpr(latex, { onError: "throw" });
}

describe("toAlgebrite", () => {
  it("builds arithmetic while substituting symbols with safe names", () => {
    const result = toAlgebrite(expr(String.raw`x_0+2 \mu_s`));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toString()).toBe("__pdp0+2*__pdp1");
    expect(result.symbols.originalBySafe.get("__pdp0")).toBe("x_0");
    expect(result.symbols.originalBySafe.get("__pdp1")).toBe(String.raw`\mu_s`);
  });

  it("evaluates integrals during translation with explicit differentials", () => {
    const result = toAlgebrite(expr(String.raw`\int x \sin(x)\,\mathrm{d}{x}`));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toString()).toBe("-__pdp0*cos(__pdp0)+sin(__pdp0)");
  });

  it("removes differentials from integral quotient numerators during translation", () => {
    const result = toAlgebrite(expr(String.raw`\int \frac{f \,\mathrm{d}{p}}{g}`));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toString()).toBe("__pdp0*__pdp2/__pdp1");
    expect(result.symbols.originalBySafe.get("__pdp0")).toBe("f");
    expect(result.symbols.originalBySafe.get("__pdp1")).toBe("g");
    expect(result.symbols.originalBySafe.get("__pdp2")).toBe("p");
  });

  it("maps symbol-like special-font expressions to safe variables", () => {
    const result = toAlgebrite(expr(String.raw`\mathscr{H}`));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toString()).toBe("__pdp0");
    expect(result.symbols.originalBySafe.get("__pdp0")).toBe(String.raw`\mathscr{H}`);
  });

  it("maps primed symbols to safe variables", () => {
    const result = toAlgebrite(expr(String.raw`v'' + P`));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toString()).toBe("__pdp0+__pdp1");
    expect(result.symbols.originalBySafe.get("__pdp0")).toBe("v''");
    expect(result.symbols.originalBySafe.get("__pdp1")).toBe("P");
  });

  it("reports unsupported expressions without throwing", () => {
    const result = toAlgebrite(expr(String.raw`\vec{v}`));

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        {
          reason: "unsupported_expr_kind",
          exprKind: "vector",
        },
      ]),
    });
  });
});
