import { describe, expect, it } from "vitest";
import { treefromLatex, findNodeId, findNodeByLatex } from "./testHelpers";
import type { RectLTRB } from "./rectMath";
import { planMove } from "./planMove";

function isAncestorOrSelf(
  tree: ReturnType<typeof treefromLatex>,
  ancestorId: string,
  nodeId: string | null
): boolean {
  let cur: string | null = nodeId;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = tree.parentById[cur] ?? null;
  }
  return false;
}

function rectProvider(map: Record<string, RectLTRB>) {
  return (id: string) => map[id] ?? null;
}
describe("planMove", () => {
  it("plans a reorder within the same Add", () => {
    const tree = treefromLatex("a + b + c");

    const addId = tree.rootId!;
    const [aId, bId, cId] = tree.childrenById[addId];

    const plan = planMove({
      tree,
      selectedIds: [aId],
      hoverId: addId,
      pointer: { x: 35, y: 110 },
      rectFor: rectProvider({
        [addId]: { left: 0, right: 60, top: 100, bottom: 120 },
        [aId]: { left: 0, right: 10, top: 100, bottom: 120 },
        [bId]: { left: 20, right: 30, top: 100, bottom: 120 },
        [cId]: { left: 40, right: 50, top: 100, bottom: 120 },
      }),
    });

    expect(plan).toEqual({
      kind: "ReorderAdd",
      addId,
      movedId: aId,
      fromIndex: 0,
      toIndex: 1,
    });
  });

  it("plans a reorder within the same Add even when hovering a child of the Add", () => {
    const tree = treefromLatex("a + b + c");

    const addId = tree.rootId!;
    const [aId, bId, cId] = tree.childrenById[addId];

    const plan = planMove({
      tree,
      selectedIds: [aId],
      hoverId: bId, // <-- hover the child, not the container
      pointer: { x: 35, y: 110 }, // between b and c
      rectFor: rectProvider({
        [addId]: { left: 0, right: 60, top: 100, bottom: 120 },
        [aId]: { left: 0, right: 10, top: 100, bottom: 120 },
        [bId]: { left: 20, right: 30, top: 100, bottom: 120 },
        [cId]: { left: 40, right: 50, top: 100, bottom: 120 },
      }),
    });

    expect(plan).toEqual({
      kind: "ReorderAdd",
      addId,
      movedId: aId,
      fromIndex: 0,
      toIndex: 1,
    });
  });

  it("returns null if pointer is outside the Add container band (Y gate)", () => {
    const tree = treefromLatex("a + b");

    const addId = tree.rootId!;
    const [aId, bId] = tree.childrenById[addId];

    const plan = planMove({
      tree,
      selectedIds: [aId],
      hoverId: addId,
      pointer: { x: 25, y: 10 }, // far above container
      rectFor: rectProvider({
        [addId]: { left: 0, right: 40, top: 100, bottom: 120 },
        [aId]: { left: 0, right: 10, top: 100, bottom: 120 },
        [bId]: { left: 20, right: 30, top: 100, bottom: 120 },
      }),
    });

    expect(plan).toBeNull();
  });

  it("plans a reorder within a product when mode is multiplicative", () => {
    const tree = treefromLatex("a b c");

    const mulId = tree.rootId!;
    const [aId, bId, cId] = tree.childrenById[mulId];

    const plan = planMove({
      tree,
      selectedIds: [aId],
      hoverId: cId, // hover inside same product
      pointer: { x: 35, y: 110 },
      rectFor: rectProvider({
        [mulId]: { left: 0, right: 60, top: 100, bottom: 120 },
        [aId]: { left: 0, right: 10, top: 100, bottom: 120 },
        [bId]: { left: 20, right: 30, top: 100, bottom: 120 },
        [cId]: { left: 40, right: 50, top: 100, bottom: 120 },
      }),
      mode: "multiplicative",
    });

    expect(plan).toEqual({
      kind: "ReorderAdd",
      addId: mulId,
      movedId: aId,
      fromIndex: 0,
      toIndex: 1,
    });
  });

  it("returns null if the index does not change", () => {
    const tree = treefromLatex("a + b");

    const addId = tree.rootId!;
    const [aId, bId] = tree.childrenById[addId];

    const plan = planMove({
      tree,
      selectedIds: [aId],
      hoverId: addId,
      pointer: { x: 5, y: 110 }, // still on left side => no move
      rectFor: rectProvider({
        [addId]: { left: 0, right: 40, top: 100, bottom: 120 },
        [aId]: { left: 0, right: 10, top: 100, bottom: 120 },
        [bId]: { left: 20, right: 30, top: 100, bottom: 120 },
      }),
    });

    expect(plan).toBeNull();
  });

  it("returns null if hover is not in the same Add container (e.g. hovering the other side of an Equal)", () => {
    const tree = treefromLatex("a + b = c");

    const equalId = tree.rootId!;
    const lhsAddId = tree.childrenById[equalId][0];
    const rhsCId = tree.childrenById[equalId][1];

    const [aId, bId] = tree.childrenById[lhsAddId];

    const plan = planMove({
      tree,
      selectedIds: [aId],
      hoverId: rhsCId, // hover c on RHS
      pointer: { x: 35, y: 110 },
      rectFor: rectProvider({
        // only rects that might be queried by the current implementation
        [lhsAddId]: { left: 0, right: 60, top: 100, bottom: 120 },
        [aId]: { left: 0, right: 10, top: 100, bottom: 120 },
        [bId]: { left: 20, right: 30, top: 100, bottom: 120 },
      }),
    });

    expect(plan).toBeNull();
  });

  it("plans a reorder when hovering a nested node inside an Add child (ancestor walk)", () => {
    const tree = treefromLatex(String.raw`a b + c + d`);

    const addId = tree.rootId!;
    const [mulId, cId, dId] = tree.childrenById[addId];

    // mulId should be something like Multiply(a,b)
    const mulKids = tree.childrenById[mulId] ?? [];
    expect(mulKids.length).toBeGreaterThanOrEqual(2);
    const bId = mulKids[1];

    // Drag c (index 1) to the end (after d)
    const plan = planMove({
      tree,
      selectedIds: [cId],
      hoverId: bId, // <-- hover nested node inside Multiply term
      pointer: { x: 80, y: 110 }, // to the right of d => drop at end
      rectFor: rectProvider({
        [addId]: { left: 0, right: 90, top: 100, bottom: 120 },
        [mulId]: { left: 0, right: 30, top: 100, bottom: 120 },
        [cId]: { left: 40, right: 50, top: 100, bottom: 120 },
        [dId]: { left: 60, right: 70, top: 100, bottom: 120 },
      }),
    });

    expect(plan).toEqual({
      kind: "ReorderAdd",
      addId,
      movedId: cId,
      fromIndex: 1,
      toIndex: 2, // after removing c, "end slot" maps to index 2
    });
  });

  it("prefers the Add on the hovered side when hoverId is the Equal node", () => {
    const tree = treefromLatex("a + b = c + d");

    const equalId = tree.rootId!;
    const lhsAddId = tree.childrenById[equalId][0];
    const rhsAddId = tree.childrenById[equalId][1];

    const [aId, bId] = tree.childrenById[lhsAddId];

    // Drag 'a' to be after 'b' (still on LHS), but MathLive says we are hovering Equal.
    const plan = planMove({
      tree,
      selectedIds: [aId],
      hoverId: equalId,
      pointer: { x: 40, y: 110 }, // clearly on LHS side (left of equals midpoint)
      rectFor: rectProvider({
        [equalId]: { left: 0, right: 100, top: 100, bottom: 120 },
        [lhsAddId]: { left: 0, right: 49, top: 100, bottom: 120 },
        [rhsAddId]: { left: 51, right: 100, top: 100, bottom: 120 },

        [aId]: { left: 0, right: 10, top: 100, bottom: 120 },
        [bId]: { left: 20, right: 30, top: 100, bottom: 120 },
      }),
    });

    expect(plan).toEqual({
      kind: "ReorderAdd",
      addId: lhsAddId,
      movedId: aId,
      fromIndex: 0,
      toIndex: 1,
    });
  });

  it("plans additive cross '=' for a negated friction product on RHS", () => {
    const tree = treefromLatex(
      String.raw`0 = \sin\left(\theta\right) - \mu_{s} \cos\left(\theta\right)`
    );

    const equalId = tree.rootId!;
    const [lhsId, rhsId] = tree.childrenById[equalId];

    const muId = findNodeByLatex(tree, String.raw`\mu_{s}`);
    const cosId = findNodeByLatex(tree, String.raw`\cos\left(\theta\right)`);

    const plan = planMove({
      tree,
      selectedIds: [muId, cosId],
      hoverId: lhsId,
      pointer: { x: 20, y: 50 },
      mode: "additive",
      rectFor: rectProvider({
        [equalId]: { left: 0, right: 200, top: 0, bottom: 100 },
        [lhsId]: { left: 10, right: 40, top: 0, bottom: 100 },
        [rhsId]: { left: 120, right: 190, top: 0, bottom: 100 },
      }),
    });

    expect(plan).not.toBeNull();
    if (!plan) return;
    if (plan.kind === "MoveAcrossEqual") {
      expect(plan.fromSide).toBe(1);
      expect(plan.toSide).toBe(0);
    } else if (plan.kind === "WrapIntoAddThenInsert") {
      expect(plan.replaceSlot).toBe(0);
    } else {
      expect(plan.kind).toBe("WrapIntoAddThenInsert");
    }
  });

  it("plans InsertIntoAdd when dragging from one Add and hovering the other side's Add (via Equal hover)", () => {
    const tree = treefromLatex("a + b = c + d");

    const equalId = tree.rootId!;
    const lhsAddId = tree.childrenById[equalId][0];
    const rhsAddId = tree.childrenById[equalId][1];

    const [aId, bId] = tree.childrenById[lhsAddId];
    const [cId, dId] = tree.childrenById[rhsAddId];

    // Drag 'a' from LHS and drop between c and d on RHS,
    // but hoverId comes in as Equal.
    const plan = planMove({
      tree,
      selectedIds: [aId],
      hoverId: equalId,
      pointer: { x: 75, y: 110 }, // between c(mid 65) and d(mid 85)
      rectFor: rectProvider({
        [equalId]: { left: 0, right: 100, top: 100, bottom: 120 },

        [lhsAddId]: { left: 0, right: 49, top: 100, bottom: 120 },
        [rhsAddId]: { left: 51, right: 100, top: 100, bottom: 120 },

        [aId]: { left: 0, right: 10, top: 100, bottom: 120 },
        [bId]: { left: 20, right: 30, top: 100, bottom: 120 },

        [cId]: { left: 60, right: 70, top: 100, bottom: 120 },
        [dId]: { left: 80, right: 90, top: 100, bottom: 120 },
      }),
    });

    expect(plan).toEqual({
      kind: "InsertIntoAdd",
      fromAddId: lhsAddId,
      toAddId: rhsAddId,
      movedId: aId,
      fromIndex: 0,
      toIndex: 1, // insert between c and d => [c, a, d]
    });
  });

  it("returns null when inserting into an Add that is inside the moved subtree (descendant ban)", () => {
    const tree = treefromLatex(String.raw`\left(a+b\right) + c + d`);

    const outerAddId = tree.rootId!;
    const [delimId] = tree.childrenById[outerAddId];

    // Delimiter should wrap an Add for (a+b)
    expect(tree.nodesById[delimId]?.op).toBe("Delimiter");
    const innerAddId = (tree.childrenById[delimId] ?? [])[0];
    expect(tree.nodesById[innerAddId]?.op).toBe("Add");

    const [aId, bId] = tree.childrenById[innerAddId];

    const plan = planMove({
      tree,
      selectedIds: [delimId], // moving the whole (a+b) group
      hoverId: aId, // hover inside the inner Add (descendant of movedId)
      pointer: { x: 25, y: 110 },
      rectFor: rectProvider({
        // Outer Add band
        [outerAddId]: { left: 0, right: 120, top: 100, bottom: 120 },

        // Delimiter term (moved payload)
        [delimId]: { left: 0, right: 40, top: 100, bottom: 120 },

        // Inner Add band (drop target candidate)
        [innerAddId]: { left: 0, right: 40, top: 100, bottom: 120 },
        [aId]: { left: 0, right: 10, top: 100, bottom: 120 },
        [bId]: { left: 20, right: 30, top: 100, bottom: 120 },
      }),
    });

    expect(plan).toBeNull();
  });

  it("chooses the closest Add by rect containment when multiple Add ancestors exist", () => {
    const tree = treefromLatex(String.raw`a + \left(b+c\right) + d`);

    const outerAddId = tree.rootId!;
    expect(tree.nodesById[outerAddId]?.op).toBe("Add");

    const [aId, delimId, dId] = tree.childrenById[outerAddId];

    // Delimiter wraps an inner Add for (b+c)
    expect(tree.nodesById[delimId]?.op).toBe("Delimiter");
    const innerAddId = (tree.childrenById[delimId] ?? [])[0];
    expect(tree.nodesById[innerAddId]?.op).toBe("Add");

    const [bId, cId] = tree.childrenById[innerAddId];

    // We drag 'a' and hover a nested node 'b', BUT the pointer is outside the inner Add rect
    // and inside the outer Add rect near the gap between (b+c) and d.
    const plan = planMove({
      tree,
      selectedIds: [aId],
      hoverId: bId, // deep hover inside inner add subtree
      pointer: { x: 82, y: 110 }, // outside innerAdd rect, inside outerAdd rect
      rectFor: rectProvider({
        // outer add spans everything
        [outerAddId]: { left: 0, right: 120, top: 100, bottom: 120 },

        // outer children
        [aId]: { left: 0, right: 10, top: 100, bottom: 120 },
        [delimId]: { left: 40, right: 70, top: 100, bottom: 120 },
        [dId]: { left: 90, right: 100, top: 100, bottom: 120 },

        // inner add is narrower and does NOT contain pointer.x=82
        [innerAddId]: { left: 45, right: 65, top: 100, bottom: 120 },
        [bId]: { left: 45, right: 50, top: 100, bottom: 120 },
        [cId]: { left: 55, right: 60, top: 100, bottom: 120 },
      }),
    });

    // Intention: move 'a' after the (b+c) term => [ (b+c), a, d ]
    expect(plan).toEqual({
      kind: "ReorderAdd",
      addId: outerAddId,
      movedId: aId,
      fromIndex: 0,
      toIndex: 1,
    });
  });

  it("when hover is Equal, chooses side Add by rect containment (not Equal midpoint)", () => {
    const tree = treefromLatex("a + b = c + d");

    const equalId = tree.rootId!;
    const lhsAddId = tree.childrenById[equalId][0];
    const rhsAddId = tree.childrenById[equalId][1];

    const [aId, bId] = tree.childrenById[lhsAddId];
    const [cId, dId] = tree.childrenById[rhsAddId];

    // Pointer is over RHS Add, but still left of Equal midpoint because Equal rect is huge.
    // Old behavior (midpoint) would choose LHS. New behavior should choose RHS by containment.
    const plan = planMove({
      tree,
      selectedIds: [aId],
      hoverId: equalId,
      // mid(c)=125, mid(d)=165 => x=145 means "between c and d"
      pointer: { x: 145, y: 110 },
      rectFor: rectProvider({
        // Huge Equal rect -> midpoint heuristic is misleading
        [equalId]: { left: 0, right: 300, top: 100, bottom: 120 },

        // Actual side rects
        [lhsAddId]: { left: 0, right: 100, top: 100, bottom: 120 },
        [rhsAddId]: { left: 110, right: 200, top: 100, bottom: 120 },

        // Children (needed for slot/index)
        [aId]: { left: 0, right: 10, top: 100, bottom: 120 },
        [bId]: { left: 20, right: 30, top: 100, bottom: 120 },

        [cId]: { left: 120, right: 130, top: 100, bottom: 120 },
        [dId]: { left: 160, right: 170, top: 100, bottom: 120 },
      }),
    });

    // Moving a from LHS into RHS should produce an InsertIntoAdd plan,
    // since the pointer is over RHS.
    expect(plan).toEqual({
      kind: "InsertIntoAdd",
      fromAddId: lhsAddId,
      toAddId: rhsAddId,
      movedId: aId,
      fromIndex: 0,
      toIndex: 1, // between c and d
    });
  });

  it("plans WrapIntoAddThenInsert when dropping onto a non-Add side (no 0+ hacks)", () => {
    const tree = treefromLatex("a + b = c");

    const equalId = tree.rootId!;
    const lhsAddId = tree.childrenById[equalId][0];
    const rhsId = tree.childrenById[equalId][1]; // 'c' (not Add)

    const [aId, bId] = tree.childrenById[lhsAddId];

    const plan = planMove({
      tree,
      selectedIds: [aId],
      hoverId: equalId, // common: hover reads as Equal
      pointer: { x: 80, y: 110 }, // clearly on RHS
      rectFor: rectProvider({
        [equalId]: { left: 0, right: 100, top: 100, bottom: 120 },
        [lhsAddId]: { left: 0, right: 49, top: 100, bottom: 120 },
        [rhsId]: { left: 51, right: 100, top: 100, bottom: 120 },

        [aId]: { left: 0, right: 10, top: 100, bottom: 120 },
        [bId]: { left: 20, right: 30, top: 100, bottom: 120 },
      }),
    });

    expect(plan).toEqual({
      kind: "WrapIntoAddThenInsert",
      movedId: aId,
      fromAddId: lhsAddId,
      fromIndex: 0,
      replaceId: rhsId,
      replaceParentId: equalId,
      replaceSlot: 1,
      insertIndex: 1, // (c + a) since pointer is to the right of c midpoint-ish
    });
  });

  it("does not plan WrapIntoAddThenInsert when replace target rects are missing (low confidence)", () => {
    const tree = treefromLatex("a + b = c");

    const equalId = tree.rootId!;
    const lhsAddId = tree.childrenById[equalId][0];
    const rhsCId = tree.childrenById[equalId][1];

    const [aId, bId] = tree.childrenById[lhsAddId];

    const plan = planMove({
      tree,
      selectedIds: [aId],
      hoverId: rhsCId, // hovering RHS symbol
      pointer: { x: 80, y: 110 }, // "RHS-ish" but we provide no RHS/equal geometry
      rectFor: rectProvider({
        // Only LHS geometry provided
        [lhsAddId]: { left: 0, right: 60, top: 100, bottom: 120 },
        [aId]: { left: 0, right: 10, top: 100, bottom: 120 },
        [bId]: { left: 20, right: 30, top: 100, bottom: 120 },
      }),
    });

    expect(plan).toBeNull();
  });

  it("plans MoveAcrossEqual when dragging a direct child of Equal onto the other side", () => {
    const tree = treefromLatex("a + b = c");

    const equalId = tree.rootId!;
    const lhsAddId = tree.childrenById[equalId][0];
    const rhsCId = tree.childrenById[equalId][1];

    const [aId, bId] = tree.childrenById[lhsAddId];

    const plan = planMove({
      tree,
      selectedIds: [rhsCId], // dragging c
      hoverId: lhsAddId, // hover somewhere on LHS
      pointer: { x: 25, y: 110 }, // between mid(a)=5 and mid(b)=25? see rects below
      rectFor: rectProvider({
        [equalId]: { left: 0, right: 100, top: 100, bottom: 120 },
        [lhsAddId]: { left: 0, right: 60, top: 100, bottom: 120 },
        [rhsCId]: { left: 70, right: 80, top: 100, bottom: 120 },

        // LHS children (needed for slot computation)
        [aId]: { left: 0, right: 10, top: 100, bottom: 120 }, // mid=5
        [bId]: { left: 40, right: 50, top: 100, bottom: 120 }, // mid=45
      }),
    });

    expect(plan).toEqual({
      kind: "MoveAcrossEqual",
      movedId: rhsCId,
      equalId,
      fromSide: 1,
      toSide: 0,
      drop: {
        kind: "intoAdd",
        addId: lhsAddId,
        toIndex: 1, // x=25 is > mid(a)=5 and < mid(b)=45
      },
    });
  });

  it("plans MoveAcrossEqual additively when dragging a multiplicative product (m a) from RHS to LHS", () => {
    const tree = treefromLatex(String.raw`x^{2} + v_{x} = m a`);

    const equalId = tree.rootId!;
    const lhsAddId = tree.childrenById[equalId][0];
    const rhsMulId = tree.childrenById[equalId][1]; // m a product

    const [x2Id, vxId] = tree.childrenById[lhsAddId];

    // Find the product node (InvisibleOperator or Multiply)
    const mulOp = tree.nodesById[rhsMulId]?.op;
    expect(mulOp === "InvisibleOperator" || mulOp === "Multiply").toBe(true);

    const plan = planMove({
      tree,
      selectedIds: [rhsMulId], // dragging the product "m a"
      hoverId: lhsAddId, // hover on LHS Add
      pointer: { x: 50, y: 110 }, // in the middle of LHS
      rectFor: rectProvider({
        [equalId]: { left: 0, right: 120, top: 100, bottom: 120 },
        [lhsAddId]: { left: 0, right: 80, top: 100, bottom: 120 },
        [rhsMulId]: { left: 90, right: 120, top: 100, bottom: 120 },
        [x2Id]: { left: 0, right: 20, top: 100, bottom: 120 },
        [vxId]: { left: 30, right: 60, top: 100, bottom: 120 },
      }),
      mode: "additive", // Important: additive mode
    });

    expect(plan).not.toBeNull();
    expect(plan?.kind).toBe("MoveAcrossEqual");
    if (plan && plan.kind === "MoveAcrossEqual") {
      expect(plan.fromSide).toBe(1); // RHS
      expect(plan.toSide).toBe(0); // LHS
      expect(plan.drop.kind).toBe("intoAdd");
      if (plan.drop.kind === "intoAdd") {
        expect(plan.drop.addId).toBe(lhsAddId);
      }
    }
  });

  it("plans MoveAcrossEqual additively when dragging a factor inside a product that is a direct child of Equal", () => {
    const tree = treefromLatex(String.raw`x^{2} + v_{x} = m a`);

    const equalId = tree.rootId!;
    const lhsAddId = tree.childrenById[equalId][0];
    const rhsMulId = tree.childrenById[equalId][1]; // m a product

    const mulFactors = tree.childrenById[rhsMulId] ?? [];
    expect(mulFactors.length).toBeGreaterThanOrEqual(2);
    const mId = findNodeByLatex(tree, "m");
    const aId = findNodeByLatex(tree, "a");

    // When you click on "m" or "a", normalizeSelection should promote to the product container
    // But if it doesn't, we should still handle it. Let's test with the factor directly.
    const plan = planMove({
      tree,
      selectedIds: [mId], // dragging just "m" (a factor inside the product)
      hoverId: lhsAddId, // hover on LHS Add
      pointer: { x: 50, y: 110 }, // in the middle of LHS
      rectFor: rectProvider({
        [equalId]: { left: 0, right: 120, top: 100, bottom: 120 },
        [lhsAddId]: { left: 0, right: 80, top: 100, bottom: 120 },
        [rhsMulId]: { left: 90, right: 120, top: 100, bottom: 120 },
        [mId]: { left: 90, right: 105, top: 100, bottom: 120 },
        [aId]: { left: 105, right: 120, top: 100, bottom: 120 },
      }),
      mode: "additive", // Important: additive mode
    });

    // This should work because normalizeSelection should promote m to the product container
    // But if it doesn't, the plan should still be created
    expect(plan).not.toBeNull();
  });

  it("uses midpoint when side rects are missing for Equal hover", () => {
    const tree = treefromLatex("a = b + c");

    const equalId = tree.rootId!;
    const lhsId = tree.childrenById[equalId][0]; // a
    const rhsAddId = tree.childrenById[equalId][1]; // Add(b,c)
    const [bId, cId] = tree.childrenById[rhsAddId];

    // Drag 'a' to RHS; provide only Equal and RHS Add rects, no side rects to force midpoint path.
    const plan = planMove({
      tree,
      selectedIds: [lhsId],
      hoverId: equalId,
      pointer: { x: 75, y: 110 }, // right of midpoint -> RHS
      rectFor: rectProvider({
        [equalId]: { left: 0, right: 100, top: 100, bottom: 120 },
        [rhsAddId]: { left: 60, right: 100, top: 100, bottom: 120 },
        [bId]: { left: 60, right: 70, top: 100, bottom: 120 },
        [cId]: { left: 80, right: 90, top: 100, bottom: 120 },
      }),
    });

    expect(plan).toEqual({
      kind: "MoveAcrossEqual",
      movedId: lhsId,
      equalId,
      fromSide: 0,
      toSide: 1,
      drop: { kind: "intoAdd", addId: rhsAddId, toIndex: 1 }, // between b and c
    });
  });

  it("allows parentContains when replace rect is missing for cross-equal replace", () => {
    const tree = treefromLatex("a = c");

    const equalId = tree.rootId!;
    const lhsId = tree.childrenById[equalId][0];
    const rhsId = tree.childrenById[equalId][1];

    // Drag 'a' to RHS (non-Add). Provide only Equal rect, no RHS rect -> replaceContains false, parentContains true.
    const plan = planMove({
      tree,
      selectedIds: [lhsId],
      hoverId: equalId,
      pointer: { x: 75, y: 110 }, // RHS side of equal midpoint
      rectFor: rectProvider({
        [equalId]: { left: 0, right: 100, top: 100, bottom: 120 },
        [lhsId]: { left: 0, right: 20, top: 100, bottom: 120 },
      }),
    });

    expect(plan).toEqual({
      kind: "MoveAcrossEqual",
      movedId: lhsId,
      equalId,
      fromSide: 0,
      toSide: 1,
      drop: {
        kind: "ontoSideRoot",
        replaceId: rhsId,
        replaceParentId: equalId,
        replaceSlot: 1,
        insertIndex: 1,
      },
    });
  });

  it("falls back to nearest Add ancestor when no Add rects are measurable", () => {
    const tree = treefromLatex(String.raw`a + \left(b + c\right)`);

    const outerAddId = tree.rootId!;
    const [_aId, delimId] = tree.childrenById[outerAddId];
    const innerAddId = (tree.childrenById[delimId] ?? [])[0];
    const [bId, _cId] = tree.childrenById[innerAddId];

    // Drag b within inner Add; no rects at all -> resolveHoverTarget returns structural Add ancestor.
    const plan = planMove({
      tree,
      selectedIds: [bId],
      hoverId: bId,
      pointer: { x: 10, y: 10 },
      rectFor: rectProvider({}), // everything missing
    });

    expect(plan).toBeNull(); // later rectangle check fails, but branch coverage exercises the fallback path
  });

  it("plans MergeIntoFractionNumerator when dragging sibling factor onto numerator zone", () => {
    const tree = treefromLatex(String.raw`\vec{F} \frac{1}{m}`);

    const mulId = tree.rootId!;
    const [forceId, divideId] = tree.childrenById[mulId];
    const numeratorId = tree.childrenById[divideId]?.[0];
    expect(tree.nodesById[divideId]?.op).toBe("Divide");
    expect(numeratorId).toBeTruthy();

    const plan = planMove({
      tree,
      selectedIds: [forceId],
      hoverId: numeratorId!, // hover inside fraction numerator
      pointer: { x: 15, y: 10 },
      rectFor: rectProvider({
        [numeratorId!]: { left: 10, right: 30, top: 0, bottom: 20 },
      }),
      mode: "multiplicative",
    });

    expect(plan).toEqual({
      kind: "MergeIntoFractionNumerator",
      fromMulId: mulId,
      divideId,
      movedId: forceId,
    });
  });

  it("plans FactorOutOfIntegrate when dragging a factor from an integrand (multiplicative)", () => {
    const tree = treefromLatex(
      String.raw`v_{0}^{2} = \int_{0}^{x_{0}} 2 g \sin\left(\theta\right) \,\mathrm{d}{x}`
    );

    const equalId = tree.rootId!;
    const rhsId = tree.childrenById[equalId]?.[1]!;
    expect(tree.nodesById[rhsId]?.op).toBe("Integrate");

    const integrandId = tree.childrenById[rhsId]?.[0];
    const twoId = findNodeId(tree, (n) => {
      if (n.latex !== "2") return false;
      if (!integrandId) return false;
      const parentId = tree.parentById[n.id];
      if (!parentId) return false;
      const parentOp = tree.nodesById[parentId]?.op;
      if (!parentOp || !["InvisibleOperator", "Multiply"].includes(parentOp)) return false;
      return isAncestorOrSelf(tree, integrandId, parentId);
    });
    const mulId = tree.parentById[twoId]!;

    const plan = planMove({
      tree,
      selectedIds: [twoId],
      hoverId: rhsId,
      pointer: { x: 55, y: 10 }, // inside integral rect, left side -> before
      rectFor: rectProvider({
        [rhsId]: { left: 50, right: 70, top: 0, bottom: 20 },
      }),
      mode: "multiplicative",
    });

    expect(plan).toEqual({
      kind: "FactorOutOfIntegrate",
      movedId: twoId,
      fromMulId: mulId,
      fromIndex: tree.childrenById[mulId].indexOf(twoId),
      integrateId: rhsId,
      insertIndex: 0,
    });
  });

  it("plans FactorOutOfIntegrate even when integral rect is missing (fallback)", () => {
    const tree = treefromLatex(
      String.raw`v_{0}^{2} = \int_{0}^{x_{0}} 2 g \sin\left(\theta\right) \,\mathrm{d}{x}`
    );

    const equalId = tree.rootId!;
    const rhsId = tree.childrenById[equalId]?.[1]!;
    expect(tree.nodesById[rhsId]?.op).toBe("Integrate");

    const integrandId = tree.childrenById[rhsId]?.[0];
    const twoId = findNodeId(tree, (n) => {
      if (n.latex !== "2") return false;
      if (!integrandId) return false;
      const parentId = tree.parentById[n.id];
      if (!parentId) return false;
      const parentOp = tree.nodesById[parentId]?.op;
      if (!parentOp || !["InvisibleOperator", "Multiply"].includes(parentOp)) return false;
      return isAncestorOrSelf(tree, integrandId, parentId);
    });
    const mulId = tree.parentById[twoId]!;

    const plan = planMove({
      tree,
      selectedIds: [twoId],
      hoverId: rhsId,
      pointer: { x: 55, y: 10 },
      rectFor: rectProvider({}), // no rects provided
      mode: "multiplicative",
    });

    expect(plan).toEqual({
      kind: "FactorOutOfIntegrate",
      movedId: twoId,
      fromMulId: mulId,
      fromIndex: tree.childrenById[mulId].indexOf(twoId),
      integrateId: rhsId,
      insertIndex: 1, // defaults to after when no rect
    });
  });
});

describe("planMove multiplicative cross-equal", () => {
  it("returns a MoveAcrossEqual plan when dragging denominator product onto RHS literal", () => {
    const tree = treefromLatex(String.raw`\frac{x^{2} + v_{x}}{m a} = 1`);

    const equalId = tree.rootId!;
    const lhsId = tree.childrenById[equalId][0];
    const rhsId = tree.childrenById[equalId][1];

    const denomId = findNodeId(
      tree,
      (n) =>
        n.op === "InvisibleOperator" &&
        n.latex.includes("m") &&
        n.latex.includes("a")
    );
    expect(denomId).toBeTruthy();

    const rects: Record<string, RectLTRB> = {
      [lhsId]: { left: 0, right: 80, top: 90, bottom: 120 },
      [rhsId]: { left: 120, right: 160, top: 90, bottom: 120 },
    };
    const rectFor = (id: string) => rects[id] ?? null;

    // Pointer at x=140 is in the main body of RHS (120-160, main body is 132-148)
    const plan = planMove({
      tree,
      selectedIds: [denomId!],
      hoverId: rhsId,
      pointer: { x: 140, y: 100 },
      rectFor,
      mode: "multiplicative",
    });

    expect(plan).toEqual({
      kind: "MoveAcrossEqual",
      movedId: denomId,
      equalId,
      fromSide: 0,
      toSide: 1,
      drop: {
        kind: "ontoSideRootWhole",
        replaceId: rhsId,
        replaceParentId: equalId,
        replaceSlot: 1,
      },
    });
  });

  it("returns null when attempting to divide by a vector across '='", () => {
    const tree = treefromLatex(String.raw`\vec{F} = m \vec{a}`);

    const equalId = tree.rootId!;
    const lhsId = tree.childrenById[equalId][0];
    const rhsId = tree.childrenById[equalId][1];

    const vectorId = findNodeId(
      tree,
      (n) => n.op === "Vector" || n.op === "OverVector"
    );

    const rects: Record<string, RectLTRB> = {
      [lhsId]: { left: 0, right: 80, top: 90, bottom: 120 },
      [rhsId]: { left: 120, right: 160, top: 90, bottom: 120 },
    };
    const rectFor = (id: string) => rects[id] ?? null;

    const plan = planMove({
      tree,
      selectedIds: [vectorId],
      hoverId: lhsId,
      pointer: { x: 40, y: 100 },
      rectFor,
      mode: "multiplicative",
    });

    expect(plan).toBeNull();
  });

  it("returns null when attempting to divide by a vector component across '='", () => {
    const tree = treefromLatex(String.raw`\vec{F} = m \vec{a}`);

    const equalId = tree.rootId!;
    const lhsId = tree.childrenById[equalId][0];
    const rhsId = tree.childrenById[equalId][1];

    const vectorAId = findNodeId(
      tree,
      (n) =>
        (n.op === "Vector" || n.op === "OverVector") &&
        n.latex.includes("a")
    );
    const accelId = tree.childrenById[vectorAId]?.[0];
    const forceVectorId = findNodeId(
      tree,
      (n) =>
        (n.op === "Vector" || n.op === "OverVector") &&
        n.latex.includes("F")
    );

    const rects: Record<string, RectLTRB> = {
      [lhsId]: { left: 0, right: 80, top: 90, bottom: 120 },
      [rhsId]: { left: 120, right: 160, top: 90, bottom: 120 },
    };
    const rectFor = (id: string) => rects[id] ?? null;

    const plan = planMove({
      tree,
      selectedIds: [accelId!],
      hoverId: forceVectorId,
      pointer: { x: 40, y: 100 },
      rectFor,
      mode: "multiplicative",
    });

    expect(plan).toBeNull();
  });

  it("allows moving scalar m across '=' to isolate vector acceleration", () => {
    const tree = treefromLatex(String.raw`\vec{F} = m \vec{a}`);

    const equalId = tree.rootId!;
    const lhsId = tree.childrenById[equalId][0];
    const rhsId = tree.childrenById[equalId][1];

    const massId = findNodeId(tree, (n) => n.latex === "m");

    const rects: Record<string, RectLTRB> = {
      [lhsId]: { left: 0, right: 80, top: 90, bottom: 120 },
      [rhsId]: { left: 120, right: 200, top: 90, bottom: 120 },
    };
    const rectFor = (id: string) => rects[id] ?? null;

    // Pointer at x=40 is in the main body of LHS (0-80, main body is 12-68)
    const plan = planMove({
      tree,
      selectedIds: [massId],
      hoverId: lhsId,
      pointer: { x: 40, y: 100 },
      rectFor,
      mode: "multiplicative",
    });

    expect(plan).toEqual({
      kind: "MoveAcrossEqual",
      movedId: massId,
      equalId,
      fromSide: 1,
      toSide: 0,
      drop: {
        kind: "ontoSideRootWhole",
        replaceId: lhsId,
        replaceParentId: equalId,
        replaceSlot: 0,
      },
    });
  });

  describe("multiplicative cross-equal hit-zones", () => {
    it("plans ontoSideRootWhole when pointer is in main body of side root", () => {
      const tree = treefromLatex(String.raw`x^{2} + v_{x} = m a`);

      const equalId = tree.rootId!;
      const lhsId = tree.childrenById[equalId][0];
      const rhsId = tree.childrenById[equalId][1];

      const massId = findNodeId(tree, (n) => n.latex === "m");
      // LHS rect: left=0, right=100, so main body is roughly 12-88 (excluding 12px edge zones)
      const rects: Record<string, RectLTRB> = {
        [lhsId]: { left: 0, right: 100, top: 90, bottom: 120 },
        [rhsId]: { left: 120, right: 160, top: 90, bottom: 120 },
      };
      const rectFor = (id: string) => rects[id] ?? null;

      const plan = planMove({
        tree,
        selectedIds: [massId],
        hoverId: lhsId,
        pointer: { x: 50, y: 100 }, // in main body (between 12 and 88)
        rectFor,
        mode: "multiplicative",
      });

      expect(plan).toEqual({
        kind: "MoveAcrossEqual",
        movedId: massId,
        equalId,
        fromSide: 1,
        toSide: 0,
        drop: {
          kind: "ontoSideRootWhole",
          replaceId: lhsId,
          replaceParentId: equalId,
          replaceSlot: 0,
        },
      });
    });

    it("plans ontoSideRoot with insertIndex 0 when pointer is in left edge zone", () => {
      const tree = treefromLatex(String.raw`x^{2} + v_{x} = m a`);

      const equalId = tree.rootId!;
      const lhsId = tree.childrenById[equalId][0];
      const rhsId = tree.childrenById[equalId][1];

      const massId = findNodeId(tree, (n) => n.latex === "m");
      // LHS rect: left=0, right=100, left edge zone is 0-12
      const rects: Record<string, RectLTRB> = {
        [lhsId]: { left: 0, right: 100, top: 90, bottom: 120 },
        [rhsId]: { left: 120, right: 160, top: 90, bottom: 120 },
      };
      const rectFor = (id: string) => rects[id] ?? null;

      const plan = planMove({
        tree,
        selectedIds: [massId],
        hoverId: lhsId,
        pointer: { x: 6, y: 100 }, // in left edge zone (0-12)
        rectFor,
        mode: "multiplicative",
      });

      expect(plan).toEqual({
        kind: "MoveAcrossEqual",
        movedId: massId,
        equalId,
        fromSide: 1,
        toSide: 0,
        drop: {
          kind: "ontoSideRoot",
          replaceId: lhsId,
          replaceParentId: equalId,
          replaceSlot: 0,
          insertIndex: 0,
        },
      });
    });

    it("plans ontoSideRoot with insertIndex 1 when pointer is in right edge zone", () => {
      const tree = treefromLatex(String.raw`x^{2} + v_{x} = m a`);

      const equalId = tree.rootId!;
      const lhsId = tree.childrenById[equalId][0];
      const rhsId = tree.childrenById[equalId][1];

      const massId = findNodeId(tree, (n) => n.latex === "m");
      // LHS rect: left=0, right=100, right edge zone is 88-100
      const rects: Record<string, RectLTRB> = {
        [lhsId]: { left: 0, right: 100, top: 90, bottom: 120 },
        [rhsId]: { left: 120, right: 160, top: 90, bottom: 120 },
      };
      const rectFor = (id: string) => rects[id] ?? null;

      const plan = planMove({
        tree,
        selectedIds: [massId],
        hoverId: lhsId,
        pointer: { x: 94, y: 100 }, // in right edge zone (88-100)
        rectFor,
        mode: "multiplicative",
      });

      expect(plan).toEqual({
        kind: "MoveAcrossEqual",
        movedId: massId,
        equalId,
        fromSide: 1,
        toSide: 0,
        drop: {
          kind: "ontoSideRoot",
          replaceId: lhsId,
          replaceParentId: equalId,
          replaceSlot: 0,
          insertIndex: 1,
        },
      });
    });

    it("plans ontoSideRoot when pointer is outside rect but on that side", () => {
      const tree = treefromLatex(String.raw`x^{2} + v_{x} = m a`);

      const equalId = tree.rootId!;
      const lhsId = tree.childrenById[equalId][0];
      const rhsId = tree.childrenById[equalId][1];

      const massId = findNodeId(tree, (n) => n.latex === "m");
      // LHS rect: left=0, right=100, pointer is to the left (outside by PAD=6)
      const rects: Record<string, RectLTRB> = {
        [lhsId]: { left: 0, right: 100, top: 90, bottom: 120 },
        [rhsId]: { left: 120, right: 160, top: 90, bottom: 120 },
      };
      const rectFor = (id: string) => rects[id] ?? null;

      const plan = planMove({
        tree,
        selectedIds: [massId],
        hoverId: lhsId,
        pointer: { x: -3, y: 100 }, // outside left edge (before 0-6)
        rectFor,
        mode: "multiplicative",
      });

      expect(plan).toEqual({
        kind: "MoveAcrossEqual",
        movedId: massId,
        equalId,
        fromSide: 1,
        toSide: 0,
        drop: {
          kind: "ontoSideRoot",
          replaceId: lhsId,
          replaceParentId: equalId,
          replaceSlot: 0,
          insertIndex: 0, // before (left side)
        },
      });
    });
  });
});
