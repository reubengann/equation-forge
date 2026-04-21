import { describe, expect, it } from "vitest";
import type { ExprSelection } from "../../selectionSemantics";
import { treefromLatex, findNodeId } from "../../testHelpers";
import { canCancelTerm, cancelTerm } from "./cancelTerm";

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function select(nodeId: string): ExprSelection {
  return { kind: "node", nodeId };
}

function isDescendant(tree: ReturnType<typeof treefromLatex>, nodeId: string, ancestorId: string): boolean {
  let cur: string | null | undefined = nodeId;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = tree.parentById[cur] ?? null;
  }
  return false;
}

describe("cancelTerm", () => {
  it("removes an explicit zero term inside a sum", () => {
    const tree = treefromLatex(String.raw`a + 0 + b`);
    const zeroId = findNodeId(
      tree,
      (n) => n.latex === "0" && tree.nodesById[tree.parentById[n.id] ?? ""]?.op === "Add"
    );

    const result = cancelTerm(tree, select(zeroId));
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe("a + b");
  });

  it("removes a grouped (a - a) term that simplifies to zero", () => {
    const tree = treefromLatex(String.raw`b + \left(a - a\right)`);
    const addId = tree.rootId;
    const groupId = findNodeId(
      tree,
      (n) => n.op === "Delimiter" && tree.parentById[n.id] === addId
    );

    const result = cancelTerm(tree, select(groupId));
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe("b");
  });

  it("removes a multiplicative factor equal to 1", () => {
    const tree = treefromLatex(String.raw`1 = a 1 b`);
    const equalKids = tree.childrenById[tree.rootId] ?? [];
    const rhsId = equalKids[1];
    expect(rhsId).toBeTruthy();
    const oneFactorId = findNodeId(
      tree,
      (n) => n.latex === "1" && tree.parentById[n.id] === rhsId
    );

    const result = cancelTerm(tree, select(oneFactorId));
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe("1 = a b");
  });

  it("collapses a product containing zero when selected inside a sum", () => {
    const tree = treefromLatex(String.raw`a + b 0`);
    const zeroFactorId = findNodeId(
      tree,
      (n) =>
        n.latex === "0" &&
        tree.nodesById[tree.parentById[n.id] ?? ""]?.op === "InvisibleOperator"
    );

    const result = cancelTerm(tree, select(zeroFactorId));
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe("a");
  });

  it("collapses b 0 when both factors are selected as a multi-selection", () => {
    const tree = treefromLatex(String.raw`a + b 0`);
    const bId = findNodeId(tree, (n) => n.latex === "b");
    const zeroFactorId = findNodeId(
      tree,
      (n) =>
        n.latex === "0" &&
        tree.nodesById[tree.parentById[n.id] ?? ""]?.op === "InvisibleOperator"
    );
    const selection: ExprSelection = { kind: "multi", nodeIds: [bId, zeroFactorId] };
    expect(canCancelTerm(tree, selection)).toBe(true);
    const result = cancelTerm(tree, selection);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe("a");
  });

  it("collapses a standalone product containing zero to zero", () => {
    const tree = treefromLatex(String.raw`b 0`);
    const zeroFactorId = findNodeId(
      tree,
      (n) =>
        n.latex === "0" &&
        tree.nodesById[tree.parentById[n.id] ?? ""]?.op === "InvisibleOperator"
    );

    const result = cancelTerm(tree, select(zeroFactorId));
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe("0");
  });

  it("requires explicit pair selection to cancel a common factor", () => {
    const tree = treefromLatex(String.raw`\frac{a b}{a c}`);
    const divideId = tree.rootId;
    expect(tree.nodesById[divideId]?.op).toBe("Divide");
    const [numId, denId] = tree.childrenById[divideId] ?? [];
    expect(numId).toBeTruthy();
    expect(denId).toBeTruthy();

    const numAId = findNodeId(
      tree,
      (n) => n.latex === "a" && tree.parentById[n.id] === numId
    );
    const denAId = findNodeId(
      tree,
      (n) => n.latex === "a" && tree.parentById[n.id] === denId
    );

    // Single selection should no longer cancel across the fraction.
    expect(cancelTerm(tree, select(numAId))).toBeNull();

    const multiSel: ExprSelection = { kind: "multi", nodeIds: [numAId, denAId] };
    const result = cancelTerm(tree, multiSel);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(String.raw`\frac{b}{c}`);
  });

  it("cancels a common factor across a fraction when the numerator is a sum", () => {
    const tree = treefromLatex(
      String.raw`\frac{-\mu_{s} m g \cos\left(\theta\right) + m g \sin\left(\theta\right)}{m}`
    );
    const divideId = tree.rootId;
    const [numId, denId] = tree.childrenById[divideId] ?? [];
    expect(numId).toBeTruthy();
    expect(denId).toBeTruthy();

    const numM = findNodeId(tree, (n) => {
      if (!numId) return false;
      return n.latex === "m" && isDescendant(tree, n.id, numId);
    });
    const denM = findNodeId(tree, (n) => {
      if (!denId) return false;
      return n.latex === "m" && isDescendant(tree, n.id, denId);
    });
    expect(numM).toBeTruthy();
    expect(denM).toBeTruthy();

    const multiSel: ExprSelection = { kind: "multi", nodeIds: [numM, denM].filter(Boolean) as string[] };
    const result = cancelTerm(tree, multiSel);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`-\mu_{s} g \cos\left(\theta\right) + g \sin\left(\theta\right)`
    );
  });

  it("cancels matching additive terms across an equals sign", () => {
    const tree = treefromLatex(String.raw`a + b = b + c`);
    const equalKids = tree.childrenById[tree.rootId] ?? [];
    const lhsId = equalKids[0];
    const rhsId = equalKids[1];
    const leftB = findNodeId(tree, (n) => {
      if (!lhsId) return false;
      return n.latex === "b" && isDescendant(tree, n.id, lhsId);
    });
    const rightB = findNodeId(tree, (n) => {
      if (!rhsId) return false;
      return n.latex === "b" && isDescendant(tree, n.id, rhsId);
    });
    const sel: ExprSelection = { kind: "multi", nodeIds: [leftB, rightB].filter(Boolean) as string[] };
    const result = cancelTerm(tree, sel);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe("a = c");
  });

  it("cancels opposite-sign like terms within the same additive side (issue 78)", () => {
    const tree = treefromLatex(
      String.raw`\frac{19 R T_{1}}{2} - P_{2} v_{1} + W_{\mathrm{ab}} + Q_{\mathrm{ab}} - Q_{\mathrm{ab}} - W_{\mathrm{ab}} - \frac{17 R T_{1}}{2} + P_{1} v_{1} = 0`
    );
    const equalKids = tree.childrenById[tree.rootId] ?? [];
    const lhsId = equalKids[0];
    expect(lhsId).toBeTruthy();

    const plusQ = findNodeId(tree, (n) => {
      if (!lhsId) return false;
      return (
        n.latex === String.raw`Q_{\mathrm{ab}}` &&
        tree.parentById[n.id] === lhsId
      );
    });
    const minusQ = findNodeId(tree, (n) => {
      if (!lhsId) return false;
      return (
        n.op === "Negate" &&
        n.latex.includes(String.raw`Q_{\mathrm{ab}}`) &&
        tree.parentById[n.id] === lhsId
      );
    });
    expect(plusQ).toBeTruthy();
    expect(minusQ).toBeTruthy();

    const sel: ExprSelection = {
      kind: "multi",
      nodeIds: [plusQ, minusQ].filter(Boolean) as string[],
    };
    expect(canCancelTerm(tree, sel)).toBe(true);
    const result = cancelTerm(tree, sel);
    expect(result).not.toBeNull();
    const out = normalizeSpaces(result!.latexPlain);
    expect(out).not.toContain(String.raw`Q_{\mathrm{ab}} + -Q_{\mathrm{ab}}`);
    expect(out).not.toContain(String.raw`+ Q_{\mathrm{ab}} - Q_{\mathrm{ab}}`);
  });

  it("cancels matching multiplicative factors across an equals sign", () => {
    const tree = treefromLatex(String.raw`m a = m b`);
    const equalKids = tree.childrenById[tree.rootId] ?? [];
    const lhsId = equalKids[0];
    const rhsId = equalKids[1];
    const leftM = findNodeId(tree, (n) => {
      if (!lhsId) return false;
      return n.latex === "m" && isDescendant(tree, n.id, lhsId);
    });
    const rightM = findNodeId(tree, (n) => {
      if (!rhsId) return false;
      return n.latex === "m" && isDescendant(tree, n.id, rhsId);
    });
    const sel: ExprSelection = { kind: "multi", nodeIds: [leftM, rightM].filter(Boolean) as string[] };
    const result = cancelTerm(tree, sel);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe("a = b");
  });

  it("cancels a multiplicative factor when the other side is zero", () => {
    const tree = treefromLatex(
      String.raw`0 = g \left(\sin\left(\theta\right) - \mu_{s} \cos\left(\theta\right)\right)`
    );
    const equalKids = tree.childrenById[tree.rootId] ?? [];
    const lhsId = equalKids[0];
    const rhsId = equalKids[1];
    expect(lhsId).toBeTruthy();
    expect(rhsId).toBeTruthy();

    const gId = findNodeId(tree, (n) => {
      if (!rhsId) return false;
      return n.latex === "g" && isDescendant(tree, n.id, rhsId);
    });
    expect(gId).toBeTruthy();
    expect(canCancelTerm(tree, select(gId))).toBe(true);
    const result = cancelTerm(tree, select(gId));
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`0 = \sin\left(\theta\right) - \mu_{s} \cos\left(\theta\right)`
    );
  });

  it("does not enable cancel for a plain symbol on a nonzero equation side", () => {
    const tree = treefromLatex(
      String.raw`\mu = -\frac{1}{c_{P}} \frac{R T v^{3} b - 2 a v \left(v - b\right)^{2}}{R T v^{3} - 2 a \left(v - b\right)^{2}}`
    );
    const muId = findNodeId(tree, (n) => n.latex === String.raw`\mu`);
    expect(muId).toBeTruthy();
    expect(canCancelTerm(tree, select(muId))).toBe(false);
  });

  it("returns null when the selection is not cancellable", () => {
    const tree = treefromLatex(String.raw`a + b`);
    const aId = findNodeId(tree, (n) => n.latex === "a");

    const result = cancelTerm(tree, select(aId));
    expect(result).toBeNull();
  });

  it("allows cancel on whole RHS when it is zero-equivalent and normalizes to 0 (issue 36)", () => {
    const tree = treefromLatex(
      String.raw`\left(\frac{\partial{u}}{\partial{v}}\right)_{T} = -c_{v} 0`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();

    const selection: ExprSelection = { kind: "node", nodeId: rhsId! };
    expect(canCancelTerm(tree, selection)).toBe(true);
    const result = cancelTerm(tree, selection);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\left(\frac{\partial{u}}{\partial{v}}\right)_{T} = 0`
    );
  });

  it("collapses selected c_v 0 factors to canonical 0 (not -0) (issue 36)", () => {
    const tree = treefromLatex(
      String.raw`\left(\frac{\partial{u}}{\partial{v}}\right)_{T} = -c_{v} 0`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    const productId = findNodeId(
      tree,
      (n) => n.op === "InvisibleOperator" && rhsId != null && isDescendant(tree, n.id, rhsId)
    );
    const cvId = findNodeId(
      tree,
      (n) => n.latex === String.raw`c_{v}` && isDescendant(tree, n.id, productId)
    );
    const zeroId = findNodeId(
      tree,
      (n) => n.latex === "0" && tree.parentById[n.id] === productId
    );
    const selection: ExprSelection = { kind: "multi", nodeIds: [cvId, zeroId] };
    expect(canCancelTerm(tree, selection)).toBe(true);

    const result = cancelTerm(tree, selection);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\left(\frac{\partial{u}}{\partial{v}}\right)_{T} = 0`
    );
  });
});
