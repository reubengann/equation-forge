import { describe, expect, it } from "vitest";
import { findNodeByLatex, findNodeId, treefromLatex } from "../testHelpers";
import {
  applyMove,
  applyMoveOld,
  maybeDropHere,
  stepDown,
  stepUp,
  type State,
} from "./applyMove";
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

  it("moves a whole fraction across Equal additively (negates on RHS)", () => {
    const tree = treefromLatex(String.raw`\frac{a}{b} + c = d`);

    const divideId = findNodeId(tree, (n) => n.op === "Divide");
    const rhsId = findNodeByLatex(tree, "d");

    const next = applyMove({
      tree,
      selectedIds: [divideId],
      hoverId: rhsId,
      targetSlot: 1, // wrap onto RHS side, after existing root
    });

    expect(next).not.toBeNull();
    const latex = next!.latexPlain.replace(/\s+/g, " ");
    expect(latex).toContain(String.raw`c = d - \frac{a}{b}`);
  });

  it("moves entire LHS across Equal and wraps negated sum", () => {
    const tree = treefromLatex(String.raw`\frac{a+b}{2} + c + d = e - f`);

    const lhsAddId = tree.childrenById[tree.rootId!][0];
    const rhsAddId = tree.childrenById[tree.rootId!][1];

    const next = applyMove({
      tree,
      selectedIds: [lhsAddId],
      hoverId: rhsAddId,
      targetSlot: 2, // append after existing RHS terms
    });

    expect(next).not.toBeNull();
    const latex = next!.latexPlain.replace(/\s+/g, "");
    expect(latex).toContain(String.raw`0=e-f-\left(\frac{a+b}{2}+c+d\right)`);
  });

  it("pulls a term out of -(a+b+c) and flips its sign", () => {
    const tree = ExpressionTree.create(["Negate", ["Add", "a", "b", "c"]]);

    const negateId = tree.rootId!;
    const cId = findNodeByLatex(tree, "c");

    const next = applyMove({
      tree,
      selectedIds: [cId],
      hoverId: negateId,
      targetSlot: 1, // after the negated group
    });

    expect(next).not.toBeNull();
    const latex = next!.latexPlain.replace(/\s+/g, " ");
    expect(latex).toContain(String.raw`-\left(a + b\right) - c`);
  });

  it("moves two contiguous terms across Equal into RHS Add and negates as a group", () => {
    const tree = treefromLatex(String.raw`a + b + c = d + e`);

    const bId = findNodeByLatex(tree, "b");
    const cId = findNodeByLatex(tree, "c");

    const rhsAddId = findNodeId(
      tree,
      (n) => n.op === "Add" && n.latex.includes("d") && n.latex.includes("e")
    );

    const next = applyMove({
      tree,
      selectedIds: [bId, cId],
      hoverId: rhsAddId,
      targetSlot: 2, // append after d,e
    });

    expect(next).not.toBeNull();
    const latex = next!.latexPlain.replace(/\s+/g, " ");
    expect(latex).toContain(String.raw`a = d + e - \left(b + c\right)`);
  });

  it("treats bare symbol in equality as implicit sum", () => {
    const tree = treefromLatex(String.raw`a=b`);
    const next = applyMove({
      tree,
      selectedIds: ["n2"],
      hoverId: "n3",
      targetSlot: 0,
    });
    expect(next).not.toBeNull();
  });

  it("moves c+d into the numerator at slot 2 (append) with grouping and factor", () => {
    const tree = treefromLatex(String.raw`\frac{a+b}{2} + c + d`);

    const cId = findNodeByLatex(tree, "c");
    const dId = findNodeByLatex(tree, "d");
    const numeratorAddId = findNodeId(
      tree,
      (n) =>
        n.op === "Add" &&
        (() => {
          const p = tree.parentById[n.id];
          return p != null && tree.nodesById[p]?.op === "Divide";
        })()
    );

    const result = applyMove({
      tree,
      selectedIds: [cId, dId],
      hoverId: numeratorAddId,
      targetSlot: 2, // after a,b
    });

    expect(result).not.toBeNull();
    const plain = result!.latexPlain;
    console.log("multi-term numerator move latexPlain:", plain);
    const normalized = plain.replace(/\s+/g, "");
    const normalizedNoLeftRight = normalized.replace(/\\left|\\right/g, "");

    // Expect: (a + b + 2(c + d)) / 2  or a + b + 2(c + d) as numerator over 2
    expect(normalized.includes("a+b+2")).toBe(true);
    expect((normalized.match(/b/g) || []).length).toBe(1);
    expect(normalizedNoLeftRight).toContain(String.raw`\frac{a+b+2(c+d)}{2}`);
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

  it("rewrites Add with multiple remaining terms when lifting a middle term", () => {
    const tree = treefromLatex("a + b + c");
    const bId = findNodeByLatex(tree, "b");
    const addId = tree.parentById[bId]!;
    expect(tree.nodesById[addId]?.op).toBe("Add");

    const state0: State = {
      root: tree.rootJson,
      payload: { kind: "Selection", ids: [bId] },
    };

    const state1 = stepUp(tree, state0, addId);
    expect(state1).not.toBeNull();
    if (!state1) throw new Error("expected state after stepUp");

    const after = ExpressionTree.create(state1.root);
    expect(after.latexPlain.replace(/\s+/g, " ")).toBe("a + c");

    expect(state1.payload?.kind).toBe("Expr");
    if (state1.payload?.kind === "Expr") {
      const payloadTree = ExpressionTree.create(state1.payload.mj);
      expect(payloadTree.latexPlain).toBe("b");
    }
  });

  it("is a null when payload is already Expr or null", () => {
    const tree = treefromLatex("a + b");

    const stateExpr: State = {
      root: tree.rootJson,
      payload: { kind: "Expr", mj: "x" },
    };

    const out1 = stepUp(tree, stateExpr, "n1");
    expect(out1).toBeNull();

    const stateNull: State = {
      root: tree.rootJson,
      payload: null,
    };

    const out2 = stepUp(tree, stateNull, "n1");
    expect(out2).toEqual(stateNull);
  });

  it("removes a from (a+b)/2 and carries payload as a/2", () => {
    const tree = treefromLatex(String.raw`\frac{a+b}{2} + c`);

    const aId = normalizeSelection(tree, "n4"); // adjust if needed
    const innerAddId = "n3";
    const divideId = "n2";

    let state: State = {
      root: tree.rootJson,
      payload: { kind: "Selection", ids: [aId] },
    };

    // Up: a -> innerAdd (lift) -> divide (wrap payload as /2)
    // Note: we don't go to outerAddId here; up phase ends at LCA in executor.
    state = stepUp(tree, state, innerAddId, aId)!;
    state = stepUp(tree, state, divideId, innerAddId)!;

    const after = ExpressionTree.create(state.root);
    expect(after.latexPlain.replace(/\s+/g, " ")).toBe(
      String.raw`\frac{b}{2} + c`
    );

    expect(state.payload?.kind).toBe("Expr");
    if (state.payload?.kind !== "Expr")
      throw new Error("expected Expr payload");

    const payloadTree = ExpressionTree.create(state.payload.mj);
    expect(payloadTree.latexPlain.replace(/\s+/g, " ")).toBe(
      String.raw`\frac{a}{2}`
    );
  });

  it("rejects additive lift when selection is in the denominator", () => {
    const tree = treefromLatex(String.raw`\frac{a+b}{2} + c`);

    // Select denominator "2"
    const twoId = normalizeSelection(tree, "n6"); // adjust if needed

    let state: State = {
      root: tree.rootJson,
      payload: { kind: "Selection", ids: [twoId] },
    };

    // Walk up until we hit the Divide. No lift will happen (we're not in an Add that contains "2").
    // Then attempt to cross Divide from denominator side => must reject (null).
    // Route: 2 -> Divide
    const out = stepUp(tree, state, "n2", twoId);
    expect(out).toBeNull();
  });

  it("rejects moving d out of (a+b)/(c+d)", () => {
    const tree = treefromLatex(String.raw`\frac{a+b}{c+d}`);

    const divideId = "n1";
    const denomAddId = "n3";
    const dIdRaw = "n7";

    expect(tree.nodesById[divideId].op).toBe("Divide");
    expect(findNodeByLatex(tree, "d")).toBe(dIdRaw);

    const dId = normalizeSelection(tree, dIdRaw);

    const state: State = {
      root: tree.rootJson,
      payload: { kind: "Selection", ids: [dId] },
    };

    // We are still carrying Selection when reaching Divide => reject
    const out = stepUp(tree, state, divideId, denomAddId);
    expect(out).toBeNull();
  });

  it("returns null when carrying Expr through Divide without fromChildId", () => {
    const tree = treefromLatex(String.raw`\frac{a}{b}`);
    const divideId = tree.rootId!;

    const state: State = {
      root: tree.rootJson,
      payload: { kind: "Expr", mj: "x" },
    };

    const out = stepUp(tree, state, divideId);
    expect(out).toBeNull();
  });
});

describe("maybeDropHere", () => {
  it("returns state if currentId !== destId", () => {
    const tree = treefromLatex("a + b");
    const state: State = {
      root: tree.rootJson,
      payload: { kind: "Expr", mj: "c" },
    };
    const out = maybeDropHere(tree, state, "n999", "n1", 2);
    expect(out.didDrop).toBe(false);
    expect(out.state).toEqual(state);
  });

  it("drops Expr payload into destination Add and consumes payload", () => {
    const tree = treefromLatex("a + b");

    const addId = "n1";
    expect(tree.nodesById[addId]?.op).toBe("Add");

    const state: State = {
      root: tree.rootJson,
      payload: { kind: "Expr", mj: "c" },
    };

    const out = maybeDropHere(tree, state, addId, addId, 2);
    expect(out.didDrop).toBe(true);
    expect(out!.state.payload).toBeNull();

    const after = ExpressionTree.create(out!.state.root);
    expect(after.latexPlain.replace(/\s+/g, " ")).toBe("a + b + c");
  });

  it("rejects if currentId === destId but payload is still Selection", () => {
    const tree = treefromLatex("a + b");
    const addId = "n1";

    const state: State = {
      root: tree.rootJson,
      payload: { kind: "Selection", ids: ["n2"] },
    };

    const out = maybeDropHere(tree, state, addId, addId, 1).didDrop;
    expect(out).toBe(false);
  });

  it("is a no-op when payload is null", () => {
    const tree = treefromLatex("a + b");
    const addId = "n1";

    const state: State = {
      root: tree.rootJson,
      payload: null,
    };

    const out = maybeDropHere(tree, state, addId, addId, 1).state;
    expect(out).not.toBeNull();
    expect(out).toEqual(state);
  });

  it("inserts an Add payload as a single grouped term", () => {
    const tree2 = treefromLatex("c + d");
    const destAddId = "n1";

    const state: State = {
      root: tree2.rootJson,
      payload: { kind: "Expr", mj: ["Add", "a", "b"] },
    };

    const out = maybeDropHere(tree2, state, destAddId, destAddId, 2);
    expect(out).not.toBeNull();

    const after = ExpressionTree.create(out!.state.root);
    // Expect something like "c + d + (a + b)" depending on your latexPlain formatting
    expect(after.latexPlain.replace(/\s+/g, " ")).toContain("a + b");
  });

  it("refuses to wrap-drop when parent is Add (should target the Add instead)", () => {
    const tree = treefromLatex("a + b");
    const aId = findNodeByLatex(tree, "a");

    const state: State = {
      root: tree.rootJson,
      payload: { kind: "Expr", mj: "c" },
    };

    const out = maybeDropHere(tree, state, aId, aId, 0);
    expect(out.didDrop).toBe(false);
    expect(out.state).toEqual(state);
  });

  it("refuses to wrap-drop into a non-additive parent (e.g., Divide numerator)", () => {
    const tree = treefromLatex(String.raw`\frac{a}{b}`);
    const divideId = tree.rootId;
    const [numId] = tree.childrenById[divideId] ?? [];
    const state: State = {
      root: tree.rootJson,
      payload: { kind: "Expr", mj: "c" },
    };

    const out = maybeDropHere(tree, state, numId, numId, 0);
    expect(out.didDrop).toBe(false);
    expect(out.state).toEqual(state);
  });
});

describe("stepDown", () => {
  it("throws if payload is still Selection", () => {
    const tree = treefromLatex("a + b");
    const state: State = {
      root: tree.rootJson,
      payload: { kind: "Selection", ids: ["n2"] },
    };

    expect(() =>
      stepDown({
        tree,
        state,
        currentId: "n1",
        childId: "n1",
        destId: "n1",
        targetSlot: 1,
      })
    ).toThrow(/Selection payload/);
  });

  it("carries an Expr payload through non-destination nodes", () => {
    const tree = treefromLatex("a + b");
    const state: State = {
      root: tree.rootJson,
      payload: { kind: "Expr", mj: "c" },
    };

    const out = stepDown({
      tree,
      state,
      currentId: "n2",
      childId: "n1",
      destId: "n1",
      targetSlot: 2,
    });

    expect(out).not.toBeNull();
    expect(out!.didDrop).toBe(false);
    expect(out!.state).toEqual(state);
  });

  it("drops at destination and consumes payload", () => {
    const tree = treefromLatex("a + b");
    const addId = "n1";

    const state: State = {
      root: tree.rootJson,
      payload: { kind: "Expr", mj: "c" },
    };

    const out = stepDown({
      tree,
      state,
      currentId: addId,
      childId: addId,
      destId: addId,
      targetSlot: 2,
    });

    expect(out).not.toBeNull();
    expect(out!.didDrop).toBe(true);
    expect(out!.state.payload).toBeNull();

    const after = ExpressionTree.create(out!.state.root);
    expect(after.latexPlain.replace(/\s+/g, " ")).toBe("a + b + c");
  });

  it("allows descending into numerator and multiplies payload by denominator", () => {
    const tree = treefromLatex(String.raw`\frac{b+d}{2}`);

    const divideId = Object.entries(tree.nodesById).find(
      ([, n]) => n.op === "Divide"
    )?.[0];
    expect(divideId).toBeTruthy();

    const [numId, denId] = tree.childrenById[divideId!] ?? [];
    expect(numId).toBeTruthy();
    expect(denId).toBeTruthy();

    const state: State = {
      root: tree.rootJson,
      payload: { kind: "Expr", mj: "a" },
    };

    const out = stepDown({
      tree,
      state,
      currentId: divideId!,
      childId: numId,
      destId: "somewhereElse",
      targetSlot: 0,
    });

    expect(out).not.toBeNull();
    expect(out!.didDrop).toBe(false);
    expect(out!.state.payload?.kind).toBe("Expr");

    // Narrow for TS:
    if (out!.state.payload?.kind !== "Expr")
      throw new Error("expected Expr payload");

    const mj = out!.state.payload.mj;
    expect(Array.isArray(mj)).toBe(true);
    expect((mj as any[])[0]).toBe("InvisibleOperator");
  });

  it("rejects descending into denominator of a Divide", () => {
    const tree = treefromLatex(String.raw`\frac{a}{b}`);
    const divideId = tree.rootId!;
    const [, denId] = tree.childrenById[divideId] ?? [];

    const state: State = {
      root: tree.rootJson,
      payload: { kind: "Expr", mj: "x" },
    };

    const out = stepDown({
      tree,
      state,
      currentId: divideId,
      childId: denId,
      destId: "nowhere",
      targetSlot: 0,
    });

    expect(out).toBeNull();
  });

  it("returns state unchanged when stepping up with Selection at non-Add/non-Divide ancestor", () => {
    const tree = treefromLatex(String.raw`a = b`);
    const equalId = tree.rootId!;
    const lhsId = tree.childrenById[equalId][0];

    const state: State = {
      root: tree.rootJson,
      payload: { kind: "Selection", ids: [lhsId] },
    };

    const out = stepUp(tree, state, equalId, lhsId);
    expect(out).toBe(state);
  });
});
