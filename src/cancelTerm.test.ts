import { describe, expect, it } from "vitest";
import type { ExprSelection } from "./selectionSemantics";
import { treefromLatex, findNodeId } from "./testHelpers";
import { cancelTerm } from "./cancelTerm";

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
    const result = cancelTerm(tree, select(gId));
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`0 = \sin\left(\theta\right) - \mu_{s} \cos\left(\theta\right)`
    );
  });

  it("returns null when the selection is not cancellable", () => {
    const tree = treefromLatex(String.raw`a + b`);
    const aId = findNodeId(tree, (n) => n.latex === "a");

    const result = cancelTerm(tree, select(aId));
    expect(result).toBeNull();
  });
});
