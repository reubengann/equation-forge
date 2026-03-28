import { describe, expect, it } from "vitest";
import { applyMove } from "./applyMove";
import { findNodeByLatex, findNodeId, treefromLatex } from "../testHelpers";

function runMove({
  latex,
  select,
  hover,
  targetSlot,
}: {
  latex: string;
  select: (tree: ReturnType<typeof treefromLatex>) => string[];
  hover: (tree: ReturnType<typeof treefromLatex>) => string;
  targetSlot: number | null;
}) {
  const tree = treefromLatex(latex);
  const selectedIds = select(tree);
  const hoverId = hover(tree);
  return applyMove({
    tree,
    selectedIds,
    hoverId,
    targetSlot,
    mode: "multiplicative",
  });
}

describe("applyMoveMultiplicative executor", () => {
  it("reorders factors within a product (a b c => b c a)", () => {
    const next = runMove({
      latex: String.raw`a b c`,
      select: (tree) => [findNodeByLatex(tree, "a")],
      hover: (tree) => tree.rootId!,
      targetSlot: 3, // move to end
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe("b c a");
  });

  it("moves denominator m a across '=' to RHS", () => {
    const next = runMove({
      latex: String.raw`\frac{x^{2} + v_{x}}{m a} = 1`,
      select: (tree) => {
        const denomId = findNodeId(
          tree,
          (n) =>
            n.op === "InvisibleOperator" &&
            n.latex.includes("m") &&
            n.latex.includes("a")
        );
        return [denomId];
      },
      hover: (tree) => {
        const rhsId = tree.childrenById[tree.rootId!]?.[1];
        if (!rhsId) throw new Error("Missing RHS");
        return rhsId;
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`x^{2} + v_{x} = m a`
    );
  });

  it("moves multiplicative factor across '=' without leaving 1 on RHS", () => {
    const next = runMove({
      latex: String.raw`\vec{F} = m \vec{a}`,
      select: (tree) => [findNodeByLatex(tree, "m")],
      hover: (tree) => {
        const lhsId = tree.childrenById[tree.rootId!]?.[0];
        if (!lhsId) throw new Error("Missing LHS");
        return lhsId;
      },
      targetSlot: null, // whole division
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\frac{\vec{F}}{m} = \vec{a}`
    );
  });

  it("moves lhs denominator factor across '=' when hovering rhs fraction root at slot 0", () => {
    const next = runMove({
      latex: String.raw`\frac{a}{b} = \frac{\left(c+d\right)}{e}`,
      select: (tree) => [findNodeByLatex(tree, "b")],
      hover: (tree) => {
        const rhsId = tree.childrenById[tree.rootId!]?.[1];
        if (!rhsId) throw new Error("Missing RHS");
        return rhsId;
      },
      targetSlot: 0,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`a = b \frac{\left(c + d\right)}{e}`
    );
  });

  it("pulls a factor out of parenthesized product", () => {
    const next = runMove({
      latex: String.raw`c = \left(a b\right)`,
      select: (tree) => [findNodeByLatex(tree, "b")],
      hover: (tree) => {
        const rhsId = tree.childrenById[tree.rootId!]?.[1];
        if (!rhsId) throw new Error("Missing RHS");
        return rhsId;
      },
      targetSlot: 0,
    });

    expect(next).not.toBeNull();
    const normalized = next!.latexPlain
      .replace(/\s+/g, " ")
      .replace(/\\left|\\right/g, "")
      .trim();
    expect(normalized).toBe(String.raw`c = b (a)`);
  });

  it("merges a sibling factor back into parenthesized product", () => {
    const next = runMove({
      latex: String.raw`c = b \left(a\right)`,
      select: (tree) => [findNodeByLatex(tree, "b")],
      hover: (tree) => {
        const delimId = findNodeId(tree, (n) => n.op === "Delimiter");
        return delimId;
      },
      targetSlot: 0,
    });

    expect(next).not.toBeNull();
    const normalized = next!.latexPlain
      .replace(/\s+/g, " ")
      .replace(/\\left|\\right/g, "")
      .trim();
    expect(normalized).toBe(String.raw`c = (b a)`);
  });

  it("merges a sibling factor into the numerator of a fraction", () => {
    const next = runMove({
      latex: String.raw`\vec{F} \frac{1}{m} = \vec{a}`,
      select: (tree) => [findNodeByLatex(tree, String.raw`\vec{F}`)],
      hover: (tree) => {
        const lhsId = tree.childrenById[tree.rootId!]?.[0];
        if (!lhsId) throw new Error("Missing LHS");
        // Hover the fraction; plan mapping will target the Divide node.
        const divideId = tree.childrenById[lhsId]?.find(
          (id) => tree.nodesById[id]?.op === "Divide"
        );
        if (!divideId) throw new Error("Missing divide node");
        return divideId;
      },
      targetSlot: null, // merge into numerator
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\frac{\vec{F}}{m} = \vec{a}`
    );
  });

  it("treats Delta t as an atomic factor when merging into numerator", () => {
    const next = runMove({
      latex: String.raw`x_{n+1} = x_{n} + \frac{\left(a+b\right)}{2} \Delta t`,
      select: (tree) => {
        const deltaId = tree.idByPath["2.2.2"];
        if (!deltaId) throw new Error("Missing delta path");
        return [deltaId];
      },
      hover: (tree) => {
        const divideId = findNodeId(tree, (n) => n.op === "Divide");
        return divideId;
      },
      targetSlot: null,
    });

    expect(next).not.toBeNull();
    const normalized = next!.latexPlain.replace(/\s+/g, "");
    const noLeftRight = normalized.replace(/\\left|\\right/g, "");
    expect(noLeftRight).toContain(
      String.raw`x_{n+1}=x_{n}+\frac{(a+b)\Deltat}{2}`
    );
  });

  it("merges into numerator before existing factor when targetSlot is 0", () => {
    const next = runMove({
      latex: String.raw`a = \frac{b}{c} d`,
      select: (tree) => [findNodeByLatex(tree, "d")],
      hover: (tree) => {
        const divideId = findNodeId(tree, (n) => n.op === "Divide");
        return divideId;
      },
      targetSlot: 0,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`a = \frac{d b}{c}`
    );
  });

  it("merges into numerator after existing factor when targetSlot is 1", () => {
    const next = runMove({
      latex: String.raw`a = \frac{b}{c} d`,
      select: (tree) => [findNodeByLatex(tree, "d")],
      hover: (tree) => {
        const divideId = findNodeId(tree, (n) => n.op === "Divide");
        return divideId;
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`a = \frac{b d}{c}`
    );
  });

  it("pulls numerator factor outside fraction at slot 0", () => {
    const next = runMove({
      latex: String.raw`a = \frac{b d}{c}`,
      select: (tree) => [findNodeByLatex(tree, "b")],
      hover: (tree) => {
        const divideId = findNodeId(tree, (n) => n.op === "Divide");
        return divideId;
      },
      targetSlot: 0,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`a = b \frac{d}{c}`
    );
  });

  it("pulls numerator factor outside fraction at slot 1", () => {
    const next = runMove({
      latex: String.raw`a = \frac{b d}{c}`,
      select: (tree) => [findNodeByLatex(tree, "b")],
      hover: (tree) => {
        const divideId = findNodeId(tree, (n) => n.op === "Divide");
        return divideId;
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`a = \frac{d}{c} b`
    );
  });

  it("reorders Delta t as an atomic pair inside numerator product", () => {
    const nextFromDelta = runMove({
      latex: String.raw`a = \frac{\left(b+c\right) \Delta t}{d}`,
      select: (tree) => [findNodeId(tree, (n) => n.latex === String.raw`\Delta t`)],
      hover: (tree) => {
        const numeratorMulId = findNodeId(
          tree,
          (n) =>
            n.op === "InvisibleOperator" &&
            n.latex.includes(String.raw`\left(b + c\right)`) &&
            n.latex.includes(String.raw`\Delta t`)
        );
        return numeratorMulId;
      },
      targetSlot: 0,
    });

    const nextFromT = runMove({
      latex: String.raw`a = \frac{\left(b+c\right) \Delta t}{d}`,
      select: (tree) => [findNodeId(tree, (n) => n.latex === String.raw`\Delta t`)],
      hover: (tree) => {
        const numeratorMulId = findNodeId(
          tree,
          (n) =>
            n.op === "InvisibleOperator" &&
            n.latex.includes(String.raw`\left(b + c\right)`) &&
            n.latex.includes(String.raw`\Delta t`)
        );
        return numeratorMulId;
      },
      targetSlot: 0,
    });

    expect(nextFromDelta).not.toBeNull();
    expect(nextFromT).not.toBeNull();

    const normalizedDelta = nextFromDelta!.latexPlain
      .replace(/\s+/g, "")
      .replace(/\\left|\\right/g, "");
    const normalizedT = nextFromT!.latexPlain
      .replace(/\s+/g, "")
      .replace(/\\left|\\right/g, "");
    expect(normalizedDelta).toBe(String.raw`a=\frac{\Deltat(b+c)}{d}`);
    expect(normalizedT).toBe(String.raw`a=\frac{\Deltat(b+c)}{d}`);
  });

  describe("three outcomes for cross-equal multiplicative moves", () => {
    it("divides whole expression when targetSlot is null", () => {
      const next = runMove({
        latex: String.raw`x^{2} + v_{x} = m a`,
        select: (tree) => [findNodeByLatex(tree, "m")],
        hover: (tree) => {
          const lhsId = tree.childrenById[tree.rootId!]?.[0];
          if (!lhsId) throw new Error("Missing LHS");
          return lhsId;
        },
        targetSlot: null, // whole division
      });

      expect(next).not.toBeNull();
      expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
        String.raw`\frac{x^{2} + v_{x}}{m} = a`
      );
    });

    it("inserts reciprocal before expression when targetSlot is 0", () => {
      const next = runMove({
        latex: String.raw`x^{2} + v_{x} = m a`,
        select: (tree) => [findNodeByLatex(tree, "m")],
        hover: (tree) => {
          const lhsId = tree.childrenById[tree.rootId!]?.[0];
          if (!lhsId) throw new Error("Missing LHS");
          return lhsId;
        },
        targetSlot: 0, // left edge insertion
      });

      expect(next).not.toBeNull();
      const result = next!.latexPlain.replace(/\s+/g, " ").trim();
      // Should be \frac{1}{m}(x^{2} + v_{x}) = a or similar
      expect(result).toContain("\\frac{1}{m}");
      expect(result).toContain("x^{2} + v_{x}");
      expect(result).toContain("= a");
    });

    it("inserts reciprocal after expression when targetSlot is 1", () => {
      const next = runMove({
        latex: String.raw`x^{2} + v_{x} = m a`,
        select: (tree) => [findNodeByLatex(tree, "m")],
        hover: (tree) => {
          const lhsId = tree.childrenById[tree.rootId!]?.[0];
          if (!lhsId) throw new Error("Missing LHS");
          return lhsId;
        },
        targetSlot: 1, // right edge insertion
      });

      expect(next).not.toBeNull();
      const result = next!.latexPlain.replace(/\s+/g, " ").trim();
      // Should be (x^{2} + v_{x})\frac{1}{m} = a or similar
      expect(result).toContain("\\frac{1}{m}");
      expect(result).toContain("x^{2} + v_{x}");
      expect(result).toContain("= a");
      // The reciprocal should come after the expression
      const fracIndex = result.indexOf("\\frac{1}{m}");
      const exprIndex = result.indexOf("x^{2}");
      expect(fracIndex).toBeGreaterThan(exprIndex);
    });
  });
});
