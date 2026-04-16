import { describe, expect, it } from "vitest";
import { applyOperationToBothSides } from "./applyBothSides";
import { ExpressionTree, type MJ } from "../../ExpressionTree";
import { makeMJfromLatex } from "../../testHelpers";

function containsOp(mj: MJ, opName: string): boolean {
  if (Array.isArray(mj)) {
    if (mj[0] === opName) return true;
    return mj.slice(1).some((c) => containsOp(c as MJ, opName));
  }
  return false;
}

describe("applyOperationToBothSides", () => {
  it("applies a power operation to both sides", () => {
    const eqn = makeMJfromLatex("a + b = c");
    const result = applyOperationToBothSides(eqn, "eqn^2");

    expect(Array.isArray(result)).toBe(true);
    const lhs = (result as any)[1] as MJ;
    const rhs = (result as any)[2] as MJ;

    expect(Array.isArray(lhs)).toBe(true);
    expect((lhs as any[])[0]).toBe("Power");

    // Unwrap delimiter if present.
    const base = (() => {
      const maybe = (lhs as any[])[1];
      if (Array.isArray(maybe) && maybe[0] === "Delimiter") {
        return (maybe as any[])[1];
      }
      return maybe;
    })();

    expect(base).toEqual(["Add", "a", "b"]);
    expect(rhs).toEqual(["Power", "c", 2]);

    const latex = ExpressionTree.create(result).latexPlain;
    expect(latex).toContain("a + b");
    expect(latex).toContain("^");
  });

  it("supports multiple placeholder occurrences", () => {
    const eqn = makeMJfromLatex("m = n");
    const result = applyOperationToBothSides(eqn, "eqn + eqn");

    expect(result).toEqual([
      "Equal",
      ["Add", "m", "m"],
      ["Add", "n", "n"],
    ]);
  });

  it("errors when the operation lacks the eqn placeholder", () => {
    const eqn = makeMJfromLatex("a = b");
    expect(() => applyOperationToBothSides(eqn, "x^2")).toThrow(
      /placeholder/i
    );
  });

  it("errors when the operation produces an equality", () => {
    const eqn = makeMJfromLatex("a = b");
    expect(() => applyOperationToBothSides(eqn, "eqn = 0")).toThrow(/equality/i);
  });

  it("keeps grouping when multiplying an additive expression", () => {
    const eqn = makeMJfromLatex("a + b = c");
    const result = applyOperationToBothSides(eqn, "2 eqn");
    const lhs = (result as any)[1] as MJ;

    expect(Array.isArray(lhs)).toBe(true);
    const lhsNode = lhs as any[];
    expect(lhsNode[0]).toBe("InvisibleOperator");
    expect(containsOp(lhs, "Add")).toBe(true);
  });

  it("distributes when using explicit * in operation latex", () => {
    const eqn = makeMJfromLatex("a = b - c");
    const result = applyOperationToBothSides(eqn, "eqn*d");
    expect(result).toEqual([
      "Equal",
      ["InvisibleOperator", "a", "d"],
      [
        "Add",
        ["InvisibleOperator", "b", "d"],
        ["Negate", ["InvisibleOperator", "c", "d"]],
      ],
    ]);
    expect(ExpressionTree.create(result).latexPlain).toBe("a d = b d - c d");
  });

  it("distributes when using explicit \\cdot in operation latex", () => {
    const eqn = makeMJfromLatex("a = b - c");
    const result = applyOperationToBothSides(eqn, String.raw`eqn \cdot d`);
    expect(ExpressionTree.create(result).latexPlain).toBe("a d = b d - c d");
  });

  it("treats d(eqn) as differential of whole sides", () => {
    const eqn = makeMJfromLatex("h = u + P v");
    const result = applyOperationToBothSides(eqn, "d(eqn)");
    expect(ExpressionTree.create(result).latexPlain).toBe(
      String.raw`\mathrm{d}{h} = \mathrm{d}{\left(u + P v\right)}`
    );
  });

  it("treats d\\left(eqn\\right) as differential of whole sides", () => {
    const eqn = makeMJfromLatex("h = u + P v");
    const result = applyOperationToBothSides(eqn, String.raw`d\left(eqn\right)`);
    expect(ExpressionTree.create(result).latexPlain).toBe(
      String.raw`\mathrm{d}{h} = \mathrm{d}{\left(u + P v\right)}`
    );
  });

  it("treats d(eqn) over multiplicative side as grouped differential operand", () => {
    const eqn = makeMJfromLatex("h = a b c");
    const result = applyOperationToBothSides(eqn, "d(eqn)");
    expect(ExpressionTree.create(result).latexPlain).toBe(
      String.raw`\mathrm{d}{h} = \mathrm{d}{\left(a b c\right)}`
    );
  });

  it("treats \\int(eqn) as unresolved Integrate over whole sides", () => {
    const eqn = makeMJfromLatex("h = u + P v");
    const result = applyOperationToBothSides(eqn, String.raw`\int(eqn)`);
    const lhs = (result as any)[1] as MJ;
    const rhs = (result as any)[2] as MJ;

    expect(Array.isArray(lhs) && (lhs as any[])[0] === "Integrate").toBe(true);
    expect(Array.isArray(rhs) && (rhs as any[])[0] === "Integrate").toBe(true);
    expect((lhs as any[])[2]).toEqual(["Tuple", "Nothing"]);
    expect((rhs as any[])[2]).toEqual(["Tuple", "Nothing"]);

    const latex = ExpressionTree.create(result).latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toContain(String.raw`\int h`);
    expect(latex).not.toContain(String.raw`\mathrm{d}{Nothing}`);
  });

  it("keeps ambiguous differential products unresolved under \\int(eqn)", () => {
    const eqn = makeMJfromLatex("A = dx dy");
    const result = applyOperationToBothSides(eqn, String.raw`\int(eqn)`);
    const rhs = (result as any)[2] as MJ;

    expect(Array.isArray(rhs)).toBe(true);
    expect((rhs as any[])[0]).toBe("Integrate");
    expect((rhs as any[])[2]).toEqual(["Tuple", "Nothing"]);

    const latex = ExpressionTree.create(result).latexPlain;
    expect(latex).toContain(String.raw`\int`);
    expect(latex).not.toContain(String.raw`\mathrm{d}{Nothing}`);
  });

  it("treats \\frac{\\partial}{\\partial v}eqn as whole-side partial derivative (issue 86)", () => {
    const eqn = makeMJfromLatex(String.raw`u = c_{v} T - \frac{a}{v}`);
    const result = applyOperationToBothSides(eqn, String.raw`\frac{\partial}{\partial v}eqn`);
    expect(ExpressionTree.create(result).latexPlain).toBe(
      String.raw`\left(\frac{\partial}{\partial{v}}\right) u = \left(\frac{\partial}{\partial{v}}\right) \left(c_{v} T - \frac{a}{v}\right)`
    );
  });

  it("matches direct parse rendering for partial derivative both-sides operation (issue 86)", () => {
    const eqn = makeMJfromLatex(String.raw`u = c_{v} T - \frac{a}{v}`);
    const result = applyOperationToBothSides(eqn, String.raw`\frac{\partial}{\partial v}eqn`);
    const direct = makeMJfromLatex(
      String.raw`\left(\frac{\partial}{\partial{v}}\right) u = \left(\frac{\partial}{\partial{v}}\right) \left(c_{v} T - \frac{a}{v}\right)`
    );
    expect(ExpressionTree.create(result).latexPlain).toBe(
      ExpressionTree.create(direct).latexPlain
    );
  });

  it("groups multiplicative side operands when applying a partial operator", () => {
    const eqn = makeMJfromLatex(String.raw`f = a x`);
    const result = applyOperationToBothSides(eqn, String.raw`\frac{\partial}{\partial x}eqn`);
    expect(ExpressionTree.create(result).latexPlain).toBe(
      String.raw`\left(\frac{\partial}{\partial{x}}\right) f = \left(\frac{\partial}{\partial{x}}\right) \left(a x\right)`
    );
  });

  it("wraps applied partial operators in Delimiter nodes for selection", () => {
    const eqn = makeMJfromLatex(
      String.raw`\left(\frac{\partial{s}}{\partial{T}}\right)_{P} = \frac{c_{P}}{T}`
    );
    const result = applyOperationToBothSides(eqn, String.raw`\frac{\partial}{\partial P}eqn`);
    const lhs = (result as any[])[1] as MJ;
    const rhs = (result as any[])[2] as MJ;

    expect(Array.isArray(lhs)).toBe(true);
    expect(Array.isArray(rhs)).toBe(true);
    expect((lhs as any[])[0]).toBe("InvisibleOperator");
    expect((rhs as any[])[0]).toBe("InvisibleOperator");
    expect((lhs as any[])[1]).toEqual([
      "Delimiter",
      ["FractionPartialDerivative", "PartialD", ["Partial", "P"]],
    ]);
    expect((rhs as any[])[1]).toEqual([
      "Delimiter",
      ["FractionPartialDerivative", "PartialD", ["Partial", "P"]],
    ]);
  });

  it("parses vec notation into a Vector node", () => {
    const mj = makeMJfromLatex("\\vec{e}");
    expect(mj).toEqual(["Vector", "e"]);
  });

  it("applies a dot product with a vector e operand", () => {
    const eqn = makeMJfromLatex("\\vec{F} = m\\vec{a}");
    const result = applyOperationToBothSides(eqn, "\\vec{e} \\cdot eqn");

    expect(result).toEqual([
      "Equal",
      ["DotProduct", ["Vector", "e"], ["Vector", "F"]],
      ["DotProduct", ["Vector", "e"], ["InvisibleOperator", "m", ["Vector", "a"]]],
    ]);

    const tree = ExpressionTree.create(result);
    expect(tree.latexPlain).toContain(String.raw`\vec{e} \cdot`);
  });

  it("keeps full-side grouping when applying fractional power to multiplicative lhs (issue 48)", () => {
    const eqn = makeMJfromLatex(String.raw`P \left(\frac{R T}{P}\right)^{\gamma} = K`);
    const result = applyOperationToBothSides(eqn, String.raw`eqn^{\frac{1}{\gamma}}`);
    expect(ExpressionTree.create(result).latexPlain).toBe(
      String.raw`\left(P \left(\frac{R T}{P}\right)^{\gamma}\right)^{\frac{1}{\gamma}} = K^{\frac{1}{\gamma}}`
    );
  });

  it("keeps additive grouping when dotting a vector sum", () => {
    const eqn = makeMJfromLatex(
      String.raw`\vec{F}_{g} + \vec{N} = m \ddot{\vec{r}}`
    );
    const result = applyOperationToBothSides(
      eqn,
      String.raw`\vec{e}_x \cdot eqn`
    );

    const lhs = (result as any)[1] as MJ;
    expect(Array.isArray(lhs)).toBe(true);
    expect((lhs as any[])[0]).toBe("DotProduct");

    const rhsOperand = (lhs as any[])[2] as MJ;
    expect(Array.isArray(rhsOperand)).toBe(true);
    expect((rhsOperand as any[])[0]).toBe("Add");

    const latex = ExpressionTree.create(result).latexPlain;
    expect(latex).toContain(
      String.raw`\vec{e}_{x} \cdot \left(\vec{F}_{g} + \vec{N}\right)`
    );
  });
});
