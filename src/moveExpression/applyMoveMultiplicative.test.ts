import { describe, expect, it } from "vitest";
import { applyMove } from "./applyMove";
import { ExpressionTree, type MJ } from "../ExpressionTree";
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

  it("returns null for denominator-factor cross-equal move from additive side (issue 75)", () => {
    const next = runMove({
      latex: String.raw`\frac{\mathrm{d}{M}}{C_{C}} = \frac{d \mathscr{H}}{T} - \frac{\mathscr{H}}{T^{2}} \mathrm{d}{T}`,
      select: (tree) => [findNodeByLatex(tree, "T")],
      hover: (tree) => {
        const lhsId = tree.childrenById[tree.rootId!]?.[0];
        if (!lhsId) throw new Error("Missing LHS");
        return lhsId;
      },
      targetSlot: 1,
    });

    expect(next).toBeNull();
  });

  it("returns null for cross-equal factor-targeting when destination side is additive (issue 76)", () => {
    const next = runMove({
      latex: String.raw`C_{C} \mathrm{d}{\mathscr{H}} = T \mathrm{d}{M} + M \mathrm{d}{T}`,
      select: (tree) => [findNodeByLatex(tree, String.raw`C_{C}`)],
      hover: (tree) => findNodeByLatex(tree, String.raw`\mathrm{d}{M}`),
      targetSlot: 1,
    });

    expect(next).toBeNull();
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
      latex: String.raw`a = \frac{b q}{c}`,
      select: (tree) => [findNodeByLatex(tree, "b")],
      hover: (tree) => {
        const divideId = findNodeId(tree, (n) => n.op === "Divide");
        return divideId;
      },
      targetSlot: 0,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`a = b \frac{q}{c}`
    );
  });

  it("pulls numerator factor outside fraction at slot 1", () => {
    const next = runMove({
      latex: String.raw`a = \frac{b q}{c}`,
      select: (tree) => [findNodeByLatex(tree, "b")],
      hover: (tree) => {
        const divideId = findNodeId(tree, (n) => n.op === "Divide");
        return divideId;
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`a = \frac{q}{c} b`
    );
  });

  it("pulls numerator factor out of fraction when hovering parent Add edge", () => {
    const next = runMove({
      latex: String.raw`a = b + \frac{\left[c+d\right] e}{f}`,
      select: (tree) => [findNodeByLatex(tree, "e")],
      hover: (tree) => {
        const rhsAddId = tree.childrenById[tree.rootId!]?.[1];
        if (!rhsAddId) throw new Error("Missing RHS Add");
        return rhsAddId;
      },
      targetSlot: 2, // right edge of fraction term inside RHS Add
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`a = b + \frac{\left[c + d\right]}{f} e`
    );
  });

  it("treats compressed add slot=1 as right edge for pull-out", () => {
    const next = runMove({
      latex: String.raw`a = b + \frac{\left[c+d\right] e}{f}`,
      select: (tree) => [findNodeByLatex(tree, "e")],
      hover: (tree) => {
        const rhsAddId = tree.childrenById[tree.rootId!]?.[1];
        if (!rhsAddId) throw new Error("Missing RHS Add");
        return rhsAddId;
      },
      targetSlot: 1, // planner-compressed slot space for side-root hover
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`a = b + \frac{\left[c + d\right]}{f} e`
    );
  });

  it("pulls denominator factor outside fraction as reciprocal", () => {
    const next = runMove({
      latex: String.raw`a = b + \frac{\left[c+d\right] e}{f}`,
      select: (tree) => [findNodeByLatex(tree, "f")],
      hover: (tree) => {
        const divideId = findNodeId(tree, (n) => n.op === "Divide");
        return divideId;
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`a = b + \left[c + d\right] e \frac{1}{f}`
    );
  });

  it("pulls denominator directly when hovering sibling factor", () => {
    const next = runMove({
      latex: String.raw`a = b + \frac{\left[c+d\right]}{e} f`,
      select: (tree) => [findNodeByLatex(tree, "e")],
      hover: (tree) => [findNodeByLatex(tree, "f")][0],
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`a = b + \left[c + d\right] \frac{f}{e}`
    );
  });

  it("moves denominator e from 1/e into sibling fraction denominator (issue 141)", () => {
    const next = runMove({
      latex: String.raw`a = \frac{b}{c} \frac{1}{e}`,
      select: (tree) => [findNodeByLatex(tree, "e")],
      hover: (tree) =>
        findNodeId(
          tree,
          (n) => n.op === "Divide" && n.latex.includes(String.raw`\frac{b}{c}`)
        ),
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`a = \frac{b}{c e}`
    );
  });

  it("moves denominator v from lhs fraction to rhs multiplicatively (issue 147)", () => {
    const next = runMove({
      latex: String.raw`\frac{R T}{v} = \left(P + b\right)`,
      select: (tree) => [findNodeByLatex(tree, "v")],
      hover: (tree) => {
        const rhsId = tree.childrenById[tree.rootId!]?.[1];
        if (!rhsId) throw new Error("Missing RHS");
        return rhsId;
      },
      targetSlot: 0,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`R T = v \left(P + b\right)`
    );
  });

  it("folds moved denominator beta under matching beta sibling, not adjacent derivative fraction (issue 120)", () => {
    const next = runMove({
      latex: String.raw`-\beta \frac{c_{P}}{\beta v} \frac{\mathrm{d}{v_{s}}}{\mathrm{d}{P_{s}}} = \kappa c_{v}`,
      select: (tree) => [
        findNodeId(
          tree,
          (n) =>
            n.latex === String.raw`\beta` &&
            (() => {
              const parentId = tree.parentById[n.id];
              if (!parentId) return false;
              if (tree.nodesById[parentId]?.op !== "InvisibleOperator") return false;
              const grandParentId = tree.parentById[parentId];
              return !!grandParentId && tree.nodesById[grandParentId]?.op === "Divide";
            })()
        ),
      ],
      hover: (tree) =>
        findNodeId(
          tree,
          (n) =>
            n.op === "Divide" &&
            n.latex.includes(String.raw`\frac{c_{P}}{\beta v}`)
        ),
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    const latex = next!.latexPlain.replace(/\s+/g, " ").trim();
    expect(latex).toContain(String.raw`\frac{\beta}{\beta}`);
    expect(latex).toContain(String.raw`\frac{c_{P}}{v}`);
    expect(latex).toContain(String.raw`\frac{\mathrm{d}{v_{s}}}{\mathrm{d}{P_{s}}}`);
    expect(latex).not.toContain(
      String.raw`\frac{\frac{\mathrm{d}{v_{s}}}{\mathrm{d}{P_{s}}}}{\beta}`
    );
  });

  it("reorders factor to the right of bracketed list term (issue 31)", () => {
    const next = runMove({
      latex: String.raw`a = b c e + f \left[g h + i\right]`,
      select: (tree) => [findNodeByLatex(tree, "f")],
      hover: (tree) => {
        const listId = findNodeId(tree, (n) => n.op === "List");
        return listId;
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`a = b c e + \left[g h + i\right] f`
    );
  });

  it("reorders dv to the right of bracketed term when hovering inside the bracket subtree", () => {
    const next = runMove({
      latex: String.raw`a = b c \mathrm{d}{P} + \mathrm{d}{v} \left[f g + h\right]`,
      select: (tree) => [findNodeByLatex(tree, String.raw`\mathrm{d}{v}`)],
      hover: (tree) => {
        // Hover an inner node (f) rather than the bracket container itself.
        return findNodeByLatex(tree, "f");
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`a = b c \mathrm{d}{P} + \left[f g + h\right] \mathrm{d}{v}`
    );
  });

  it("pulls d{v}_P outside thermodynamics fraction numerator", () => {
    const next = runMove({
      latex: String.raw`c_{P} = c_{V} + \frac{\left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right] \mathrm{d}{v}_{P}}{\mathrm{d}{T}_{P}}`,
      select: (tree) => [findNodeByLatex(tree, String.raw`\mathrm{d}{v_{P}}`)],
      hover: (tree) => {
        const rhsAddId = tree.childrenById[tree.rootId!]?.[1];
        if (!rhsAddId) throw new Error("Missing RHS Add");
        return rhsAddId;
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`c_{P} = c_{V} + \frac{\left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right]}{\mathrm{d}{T_{P}}} \mathrm{d}{v_{P}}`
    );
  });

  it("moves dT across '=' and folds onto dP denominator in issue 25 shape", () => {
    const next = runMove({
      latex: String.raw`c_{P}\mathrm{d}{T}-c_{v}\mathrm{d}{T}=-\left[\left(\frac{\partial{h}}{\partial{P}}\right)_{T}-v\right]\mathrm{d}{P}`,
      select: (tree) => [findNodeByLatex(tree, String.raw`\mathrm{d}{T}`)],
      hover: (tree) => {
        const dP = findNodeByLatex(tree, String.raw`\mathrm{d}{P}`);
        return dP;
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`c_{P} - c_{v} = -\left[\left(\frac{\partial{h}}{\partial{P}}\right)_{T} - v\right] \frac{\mathrm{d}{P}}{\mathrm{d}{T}}`
    );
  });

  it("moves denominator dT from derivative fraction to LHS multiplicatively (issue 37)", () => {
    const next = runMove({
      latex: String.raw`c_{v} = \frac{\mathrm{d}{u}}{\mathrm{d}{T}}`,
      select: (tree) => [findNodeByLatex(tree, String.raw`\mathrm{d}{T}`)],
      hover: (tree) => {
        const lhsId = tree.childrenById[tree.rootId!]?.[0];
        if (!lhsId) throw new Error("Missing LHS");
        return lhsId;
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`c_{v} \mathrm{d}{T} = \mathrm{d}{u}`
    );
  });

  it("moves RHS denominator factor onto reciprocal LHS without inverting at slot 1 (issue 102)", () => {
    const next = runMove({
      latex: String.raw`\frac{1}{T_{h} - T_{c}} = \frac{Q_{h2}}{\left(Q_{h2} - Q_{c}\right) T_{h}}`,
      select: (tree) => [
        findNodeId(
          tree,
          (n) =>
            n.latex === String.raw`T_{h}` &&
            (() => {
              const rhsId = tree.childrenById[tree.rootId!]?.[1];
              if (!rhsId) return false;
              let cur: string | null = n.id;
              while (cur) {
                if (cur === rhsId) return true;
                cur = tree.parentById[cur] ?? null;
              }
              return false;
            })()
        ),
      ],
      hover: (tree) => {
        const lhsId = tree.childrenById[tree.rootId!]?.[0];
        if (!lhsId) throw new Error("Missing LHS");
        return lhsId;
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\frac{1}{T_{h} - T_{c}} T_{h} = \frac{Q_{h2}}{\left(Q_{h2} - Q_{c}\right)}`
    );
  });

  it("moves RHS denominator factor onto reciprocal LHS without inverting at slot 0 (issue 102)", () => {
    const next = runMove({
      latex: String.raw`\frac{1}{T_{h} - T_{c}} = \frac{Q_{h2}}{\left(Q_{h2} - Q_{c}\right) T_{h}}`,
      select: (tree) => [
        findNodeId(
          tree,
          (n) =>
            n.latex === String.raw`T_{h}` &&
            (() => {
              const rhsId = tree.childrenById[tree.rootId!]?.[1];
              if (!rhsId) return false;
              let cur: string | null = n.id;
              while (cur) {
                if (cur === rhsId) return true;
                cur = tree.parentById[cur] ?? null;
              }
              return false;
            })()
        ),
      ],
      hover: (tree) => {
        const lhsId = tree.childrenById[tree.rootId!]?.[0];
        if (!lhsId) throw new Error("Missing LHS");
        return lhsId;
      },
      targetSlot: 0,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`T_{h} \frac{1}{T_{h} - T_{c}} = \frac{Q_{h2}}{\left(Q_{h2} - Q_{c}\right)}`
    );
  });

  it("reorders dv to the right of additive delimiter term in product (issue 103)", () => {
    const next = runMove({
      latex: String.raw`\mathrm{d}{s} = \frac{1}{T} \left(\frac{\partial{u}}{\partial{T}}\right)_{v} \mathrm{d}{T} + \frac{1}{T} \mathrm{d}{v} \left(\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right)`,
      select: (tree) => [findNodeByLatex(tree, String.raw`\mathrm{d}{v}`)],
      hover: (tree) =>
        findNodeId(
          tree,
          (n) =>
            n.op === "Delimiter" &&
            n.latex.includes(String.raw`\frac{\partial{u}}{\partial{v}}`) &&
            n.latex.includes("+ P")
        ),
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\mathrm{d}{s} = \frac{1}{T} \left(\frac{\partial{u}}{\partial{T}}\right)_{v} \mathrm{d}{T} + \frac{1}{T} \left(\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right) \mathrm{d}{v}`
    );
  });

  it("moves T out of RHS operand parentheses for applied partial operator without Error nodes", () => {
    const next = runMove({
      latex: String.raw`\frac{\partial^{2}{s}}{\partial{P} \partial{T}} = \left(\frac{\partial}{\partial{P}}\right) \left(\frac{c_{P}}{T}\right)`,
      select: (tree) => [
        findNodeId(
          tree,
          (n) =>
            n.latex === "T" &&
            (() => {
              const rhsId = tree.childrenById[tree.rootId!]?.[1];
              if (!rhsId) return false;
              let cur: string | null = n.id;
              while (cur) {
                if (cur === rhsId) return true;
                cur = tree.parentById[cur] ?? null;
              }
              return false;
            })()
        ),
      ],
      hover: (tree) =>
        findNodeId(
          tree,
          (n) =>
            n.op === "Delimiter" &&
            n.latex.includes(String.raw`\frac{c_{P}}{T}`)
        ),
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain).not.toContain("Error");
  });

  it("reorders dv using debug trace args with nested product shape (issue 103)", () => {
    const root: MJ = [
      "Equal",
      ["Differential", "s"],
      [
        "Add",
        [
          "InvisibleOperator",
          ["Divide", 1, "T"],
          [
            "Subscript",
            ["Delimiter", ["FractionPartialDerivative", ["Partial", "u"], ["Partial", "T"]]],
            "v",
          ],
          ["Differential", "T"],
        ],
        [
          "InvisibleOperator",
          ["InvisibleOperator", ["Divide", 1, "T"], ["Differential", "v"]],
          [
            "Delimiter",
            [
              "Add",
              [
                "Subscript",
                ["Delimiter", ["FractionPartialDerivative", ["Partial", "u"], ["Partial", "v"]]],
                "T",
              ],
              "P",
            ],
          ],
        ],
      ],
    ];
    const tree = ExpressionTree.create(root);
    const movedDvId = tree.idByPath["2.2.1.2"];
    const hoverOuterMulId = tree.idByPath["2.2"];
    expect(movedDvId).toBeTruthy();
    expect(hoverOuterMulId).toBeTruthy();

    const next = applyMove({
      tree,
      selectedIds: [movedDvId!],
      hoverId: hoverOuterMulId!,
      targetSlot: 2,
      mode: "multiplicative",
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\mathrm{d}{s} = \frac{1}{T} \left(\frac{\partial{u}}{\partial{T}}\right)_{v} \mathrm{d}{T} + \frac{1}{T} \left(\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right) \mathrm{d}{v}`
    );
  });

  it("moves denominator dv from LHS derivative fraction to RHS (issue 59)", () => {
    const next = runMove({
      latex: String.raw`c_{v} \frac{\mathrm{d}{T}}{\mathrm{d}{v}} = -\frac{R T}{v}`,
      select: (tree) => [findNodeByLatex(tree, String.raw`\mathrm{d}{v}`)],
      hover: (tree) => {
        const rhsId = tree.childrenById[tree.rootId!]?.[1];
        if (!rhsId) throw new Error("Missing RHS");
        return rhsId;
      },
      targetSlot: null,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`c_{v} \mathrm{d}{T} = -\frac{R T}{v} \mathrm{d}{v}`
    );
  });

  it("moves numerator dT_c out of FractionDerivative within product (issue 93)", () => {
    const next = runMove({
      latex: String.raw`T_{c}=T_{h}\frac{\mathrm{d}{T_{c}}}{\mathrm{d}{T_{h}}}`,
      select: (tree) => [findNodeByLatex(tree, String.raw`\mathrm{d}{T_{c}}`)],
      hover: (tree) => findNodeByLatex(tree, String.raw`T_{h}`),
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`T_{c} = T_{h} \mathrm{d}{T_{c}} \frac{1}{\mathrm{d}{T_{h}}}`
    );
  });

  it("moves numerator dT_c across '=' to LHS from FractionDerivative (issue 93)", () => {
    const next = runMove({
      latex: String.raw`-T_{c}=-T_{h}\frac{\mathrm{d}{T_{c}}}{\mathrm{d}{T_{h}}}`,
      select: (tree) => [findNodeByLatex(tree, String.raw`\mathrm{d}{T_{c}}`)],
      hover: (tree) => {
        const lhsId = tree.childrenById[tree.rootId!]?.[0];
        if (!lhsId) throw new Error("Missing LHS");
        return lhsId;
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`-\frac{T_{c}}{\mathrm{d}{T_{c}}} = -T_{h} \frac{1}{\mathrm{d}{T_{h}}}`
    );
  });

  it("moves numerator factor out of fractional side root across '=' (issue 49)", () => {
    const next = runMove({
      latex: String.raw`\frac{R T P^{\frac{1}{\gamma}}}{P} = K^{\frac{1}{\gamma}}`,
      select: (tree) => [findNodeByLatex(tree, String.raw`R`)],
      hover: (tree) => {
        const rhsId = tree.childrenById[tree.rootId!]?.[1];
        if (!rhsId) throw new Error("Missing RHS");
        return rhsId;
      },
      targetSlot: null,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\frac{T P^{\frac{1}{\gamma}}}{P} = \frac{K^{\frac{1}{\gamma}}}{R}`
    );
  });

  it("moves R across '=' when R is inside fraction factor within product (issue 49 follow-up)", () => {
    const next = runMove({
      latex: String.raw`\frac{R T}{v} v^{\gamma} = K`,
      select: (tree) => [findNodeByLatex(tree, String.raw`R`)],
      hover: (tree) => {
        const rhsId = tree.childrenById[tree.rootId!]?.[1];
        if (!rhsId) throw new Error("Missing RHS");
        return rhsId;
      },
      targetSlot: null,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\frac{T}{v} v^{\gamma} = \frac{K}{R}`
    );
  });

  it("treats selecting v as selecting v^gamma for cross-equal move (issue 50)", () => {
    const next = runMove({
      latex: String.raw`P v^{\gamma} = K`,
      select: (tree) => [findNodeByLatex(tree, String.raw`v`)],
      hover: (tree) => {
        const rhsId = tree.childrenById[tree.rootId!]?.[1];
        if (!rhsId) throw new Error("Missing RHS");
        return rhsId;
      },
      targetSlot: null,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`P = \frac{K}{v^{\gamma}}`
    );
  });

  it("pulls K out of integral while preserving 1/v^gamma integrand (issue 51)", () => {
    const next = runMove({
      latex: String.raw`w = \int_{v_{1}}^{v_{2}} \frac{K}{v^{\gamma}} \,\mathrm{d}{v}`,
      select: (tree) => [findNodeByLatex(tree, String.raw`K`)],
      hover: (tree) => findNodeId(tree, (n) => n.op === "Integrate"),
      targetSlot: 0,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`w = K \int_{v_{1}}^{v_{2}} \frac{1}{v^{\gamma}} \,\mathrm{d}{v}`
    );
  });

  it("pulls denominator factor T out of integral as reciprocal (issue 89)", () => {
    const next = runMove({
      latex: String.raw`\int \mathrm{d}{S} = \int \frac{P \mathrm{d}{V}}{T}`,
      select: (tree) => [findNodeByLatex(tree, String.raw`T`)],
      hover: (tree) => findNodeId(tree, (n) => n.op === "Integrate" && n.latex.includes("P")),
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\int \,\mathrm{d}{S} = \int P \,\mathrm{d}{V} \frac{1}{T}`
    );
  });

  it("pulls denominator -gamma+1 out of inner fraction delimiter product (issue 53)", () => {
    const next = runMove({
      latex: String.raw`w = K \left(\frac{v_{2}^{-\gamma + 1} - v_{1}^{-\gamma + 1}}{-\gamma + 1}\right)`,
      select: (tree) => [
        findNodeId(
          tree,
          (n) =>
            n.op === "Add" &&
            n.latex.includes(String.raw`\gamma`) &&
            tree.parentById[n.id] != null &&
            tree.nodesById[tree.parentById[n.id]]?.op === "Divide" &&
            tree.childIndexById[n.id] === 1
        ),
      ],
      hover: (tree) => findNodeByLatex(tree, "K"),
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`w = \frac{K}{-\gamma + 1} \left(v_{2}^{-\gamma + 1} - v_{1}^{-\gamma + 1}\right)`
    );
  });

  it("moving denominator term across '=' keeps grouping and removes /1 artifact (issue 53 follow-up)", () => {
    const next = runMove({
      latex: String.raw`w = K \left(\frac{v_{2}^{-\gamma + 1} - v_{1}^{-\gamma + 1}}{-\gamma + 1}\right)`,
      select: (tree) => [
        findNodeId(
          tree,
          (n) =>
            n.op === "Add" &&
            n.latex.includes(String.raw`\gamma`) &&
            tree.parentById[n.id] != null &&
            tree.nodesById[tree.parentById[n.id]]?.op === "Divide" &&
            tree.childIndexById[n.id] === 1
        ),
      ],
      hover: (tree) => {
        const lhsId = tree.childrenById[tree.rootId!]?.[0];
        if (!lhsId) throw new Error("Missing LHS");
        return lhsId;
      },
      targetSlot: null,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`w \left(-\gamma + 1\right) = K \left(v_{2}^{-\gamma + 1} - v_{1}^{-\gamma + 1}\right)`
    );
  });

  it("moves only selected denominator v across '=' without moving v^(gamma-1) (issue 54)", () => {
    const next = runMove({
      latex: String.raw`P = \frac{K}{v^{\gamma - 1} v}`,
      select: (tree) => [
        findNodeId(
          tree,
          (n) =>
            n.latex === "v" &&
            tree.parentById[n.id] != null &&
            tree.nodesById[tree.parentById[n.id]]?.op === "InvisibleOperator"
        ),
      ],
      hover: (tree) => {
        const lhsId = tree.childrenById[tree.rootId!]?.[0];
        if (!lhsId) throw new Error("Missing LHS");
        return lhsId;
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\frac{P}{v} = \frac{K}{v^{\gamma - 1}}`
    );
  });

  it("moves a selected denominator factor from RHS product to LHS by multiplication (issue 65)", () => {
    const next = runMove({
      latex: String.raw`c_{P} = -\frac{1}{\left(\frac{\partial{T}}{\partial{P}}\right)_{h} \left(\frac{\partial{P}}{\partial{h}}\right)_{T}}`,
      select: (tree) => [
        findNodeId(
          tree,
          (n) =>
            n.op === "Subscript" &&
            n.latex.includes(String.raw`\frac{\partial{T}}{\partial{P}}`) &&
            n.latex.includes("_{h}")
        ),
      ],
      hover: (tree) => {
        const lhsId = tree.childrenById[tree.rootId!]?.[0];
        if (!lhsId) throw new Error("Missing LHS");
        return lhsId;
      },
      targetSlot: null,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`c_{P} \left(\frac{\partial{T}}{\partial{P}}\right)_{h} = -\frac{1}{\left(\frac{\partial{P}}{\partial{h}}\right)_{T}}`
    );
  });

  it("moves issue 65 factor to LHS edge as multiplication, not division", () => {
    const next = runMove({
      latex: String.raw`c_{P} = -\frac{1}{\left(\frac{\partial{T}}{\partial{P}}\right)_{h} \left(\frac{\partial{P}}{\partial{h}}\right)_{T}}`,
      select: (tree) => [
        findNodeId(
          tree,
          (n) =>
            n.op === "Subscript" &&
            n.latex.includes(String.raw`\frac{\partial{T}}{\partial{P}}`) &&
            n.latex.includes("_{h}")
        ),
      ],
      hover: (tree) => {
        const lhsId = tree.childrenById[tree.rootId!]?.[0];
        if (!lhsId) throw new Error("Missing LHS");
        return lhsId;
      },
      targetSlot: 1,
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`c_{P} \left(\frac{\partial{T}}{\partial{P}}\right)_{h} = -\frac{1}{\left(\frac{\partial{P}}{\partial{h}}\right)_{T}}`
    );
  });

  it("pulls c_V from numerator when divide numerator is single-term Add wrapper", () => {
    const root: MJ = [
      "Equal",
      [
        "Divide",
        [
          "Add",
          ["InvisibleOperator", ["Subscript", "c", "V"], ["Differential", "T"]],
        ],
        ["Differential", "v"],
      ],
      "r",
    ];
    const tree = ExpressionTree.create(root);
    const selectedId = findNodeByLatex(tree, String.raw`c_{V}`);
    const divideId = findNodeId(tree, (n) => n.op === "Divide");

    const next = applyMove({
      tree,
      selectedIds: [selectedId],
      hoverId: divideId,
      targetSlot: 0,
      mode: "multiplicative",
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`c_{V} \frac{\mathrm{d}{T}}{\mathrm{d}{v}} = r`
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
      // Canonical output may fold x*(1/m) into x/m.
      expect(result).toContain("\\frac{\\left(x^{2} + v_{x}\\right)}{m}");
      expect(result).toContain("x^{2} + v_{x}");
      expect(result).toContain("= a");
    });
  });
});
