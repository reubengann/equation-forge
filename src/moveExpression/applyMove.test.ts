import { describe, expect, it } from "vitest";
import { findNodeByLatex, findNodeId, treefromLatex } from "../testHelpers";
import { applyMove, applyMoveOld, stepUp, type State } from "./applyMove";
import { normalizeSelection } from "../selectionSemantics";
import { ExpressionTree } from "../ExpressionTree";

describe("applyMove", () => {
  it("can commute terms in a sum", () => {
    const tree = treefromLatex("a + b");
    const bId = findNodeByLatex(tree, "b");
    const addId = tree.parentById[bId];
    expect(addId).not.toBeNull();
    expect(tree.nodesById[addId!]?.op).toBe("Add");

    const out = applyMoveOld({
      tree,
      selectedIds: [bId],
      hoverId: addId!,
      targetSlot: 0,
    });

    expect(out).not.toBeNull();
    expect(out!.latexPlain).toBe("b + a");
  });

  it("If target slot is the same, does nothing", () => {
    const tree = treefromLatex("a + b");
    const bId = findNodeByLatex(tree, "b");
    const addId = tree.parentById[bId];
    expect(addId).not.toBeNull();
    expect(tree.nodesById[addId!]?.op).toBe("Add");

    const out = applyMoveOld({
      tree,
      selectedIds: [bId],
      hoverId: addId!,
      targetSlot: 1,
    });

    expect(out).toBeNull();
  });

  it("going right", () => {
    const tree = treefromLatex("a + b + c");
    const bId = findNodeByLatex(tree, "b");
    const addId = tree.parentById[bId];
    expect(addId).not.toBeNull();
    expect(tree.nodesById[addId!]?.op).toBe("Add");

    const out = applyMoveOld({
      tree,
      selectedIds: [bId],
      hoverId: addId!,
      targetSlot: 3,
    });

    expect(out).not.toBeNull();
    expect(out!.latexPlain).toBe("a + c + b");
  });

  it("can reorder subtraction as -f + e", () => {
    const tree = treefromLatex("e - f");
    const fId = findNodeByLatex(tree, "f");
    const negId = tree.parentById[fId];
    expect(negId).not.toBeNull();
    expect(tree.nodesById[negId!]?.op).toBe("Negate");

    const addId = tree.parentById[negId!];
    expect(addId).not.toBeNull();
    expect(tree.nodesById[addId!]?.op).toBe("Add");

    const out = applyMoveOld({
      tree,
      selectedIds: [fId], // selecting f should drag the whole Negate(f)
      hoverId: addId!,
      targetSlot: 0,
    });

    expect(out).not.toBeNull();
    expect(out!.latexPlain).toBe("-f + e");
  });

  it("moves an additive term across Equal (LHS -> RHS)", () => {
    const tree = treefromLatex(String.raw`e - f = g + h`);

    const movedId = findNodeId(
      tree,
      (n) => n.op === "Negate" && n.latex === "-f"
    );
    const rhsAddId = findNodeId(
      tree,
      (n) => n.op === "Add" && n.latex.includes("g") && n.latex.includes("h")
    );

    const next = applyMove({
      tree,
      selectedIds: [movedId],
      hoverId: rhsAddId,
      targetSlot: 2, // append after g,h
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain).toContain(String.raw`e = g + h + f`);
  });
});

describe("stepUp", () => {
  it("lifts selected term(s) out of the first Add encountered and consumes Selection", () => {
    const tree = treefromLatex("e - f = g + h");

    // Selecting 'f' should normalize to selecting the whole Negate(f)
    const fId = findNodeByLatex(tree, "f");
    const movedId = normalizeSelection(tree, fId);

    const lhsAddId = tree.parentById[movedId];
    expect(lhsAddId).not.toBeNull();
    expect(tree.nodesById[lhsAddId!]?.op).toBe("Add");

    const eqId = tree.parentById[lhsAddId!];
    expect(eqId).not.toBeNull();
    expect(tree.nodesById[eqId!]?.op).toBe("Equal");

    const state0: State = {
      root: tree.rootJson,
      payload: { kind: "Selection", ids: [movedId] },
    };

    // Act: stepUp at the LHS Add should perform the lift
    const state1 = stepUp(tree, state0, lhsAddId!);
    expect(state1).not.toBeNull();

    // Tree should now have removed -f from the LHS, collapsing Add -> "e"
    const treeAfter = ExpressionTree.create((state1 as State).root);
    expect(treeAfter.latexPlain).toBe("e = g + h");

    // Payload should now be Expr, not Selection
    expect((state1 as State).payload).not.toBeNull();
    expect((state1 as State).payload!.kind).toBe("Expr");

    const payloadMJ =
      (state1 as State).payload!.kind === "Expr"
        ? (state1 as any).payload.mj
        : null;

    // The lifted payload should be the Negate(f) subtree (since movedId is Negate)
    expect(Array.isArray(payloadMJ)).toBe(true);
    expect((payloadMJ as any[])[0]).toBe("Negate");
  });

  it("is a no-op when payload is already Expr or null", () => {
    const tree = treefromLatex("a + b");

    const stateExpr: State = {
      root: tree.rootJson,
      payload: { kind: "Expr", mj: "x" },
    };

    const out1 = stepUp(tree, stateExpr, "n1");
    expect(out1).toEqual(stateExpr);

    const stateNull: State = {
      root: tree.rootJson,
      payload: null,
    };

    const out2 = stepUp(tree, stateNull, "n1");
    expect(out2).toEqual(stateNull);
  });
});
