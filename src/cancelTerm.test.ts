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

  it("returns null when the selection is not cancellable", () => {
    const tree = treefromLatex(String.raw`a + b`);
    const aId = findNodeId(tree, (n) => n.latex === "a");

    const result = cancelTerm(tree, select(aId));
    expect(result).toBeNull();
  });
});
