import { describe, expect, it } from "vitest";
import { ExpressionTree } from "../../ExpressionTree";
import type { RectProvider } from "../../domain/move/planMoveGeometry";
import type { RectLTRB } from "../../rectMath";
import {
  computeInsertX,
  targetRectForPlan,
} from "./renderInsertOverlay";
import type { MovePlan } from "../../domain/move/planMove";

function rect(left: number, right: number, top = 0, bottom = 10): RectLTRB {
  return { left, right, top, bottom };
}

function rectFor(rects: Record<string, RectLTRB | null>): RectProvider {
  return (id) => rects[id] ?? null;
}

describe("computeInsertX", () => {
  const addTree = ExpressionTree.create(["Add", "a", "b", "c"]);
  const addId = addTree.rootId;
  const [aId, bId, cId] = addTree.childrenById[addId];

  it("returns the correct slot position for ReorderAdd", () => {
    const rects = rectFor({
      [aId]: rect(0, 10),
      [bId]: rect(20, 30),
      [cId]: rect(40, 50),
    });

    const plan: MovePlan = {
      kind: "ReorderAdd",
      addId,
      movedId: cId,
      fromIndex: 2,
      toIndex: 0,
    };

    // Moving c to the front chooses slot 0 -> uses left edge of first visible rect
    expect(computeInsertX(plan, addTree, rects)).toBe(0);
  });

  it("uses midpoint between neighbors for InsertIntoAdd", () => {
    const rects = rectFor({
      [aId]: rect(0, 10),
      [bId]: rect(40, 50),
      [cId]: rect(80, 90),
    });

    const plan: MovePlan = {
      kind: "InsertIntoAdd",
      fromAddId: addId,
      toAddId: addId,
      movedId: "new",
      fromIndex: 0,
      toIndex: 1,
    };

    // Between a (right=10) and b (left=40) => midpoint 25
    expect(computeInsertX(plan, addTree, rects)).toBe(25);
  });

  it("falls back to child rects for Negate nodes when measuring slots", () => {
    const negTree = ExpressionTree.create(["Add", ["Negate", "x"]]);
    const negAddId = negTree.rootId;
    const negateId = negTree.childrenById[negAddId][0];
    const innerId = negTree.childrenById[negateId][0];

    const rects = rectFor({
      [negateId]: null, // direct rect missing
      [innerId]: rect(100, 120), // child rect present
    });

    const plan: MovePlan = {
      kind: "InsertIntoAdd",
      fromAddId: negAddId,
      toAddId: negAddId,
      movedId: "new",
      fromIndex: 0,
      toIndex: 1,
    };

    // Should reuse the child's rect from the Negate wrapper -> right edge 120
    expect(computeInsertX(plan, negTree, rects)).toBe(120);
  });

  it("returns null for ontoSideRootWhole drop targets", () => {
    const rects = rectFor({});
    const plan: MovePlan = {
      kind: "MoveAcrossEqual",
      movedId: "m",
      equalId: "eq",
      fromSide: 0,
      toSide: 1,
      drop: {
        kind: "ontoSideRootWhole",
        replaceId: "rhs",
        replaceParentId: "eq",
        replaceSlot: 1,
      },
    };

    expect(computeInsertX(plan, addTree, rects)).toBeNull();
  });
});

describe("targetRectForPlan", () => {
  const rects = rectFor({
    addTarget: rect(0, 10),
    replaceTarget: rect(20, 30),
    divideId: rect(40, 50),
    dotId: rect(60, 70),
  });

  it("returns expected rect for plan variants", () => {
    const insert: MovePlan = {
      kind: "InsertIntoAdd",
      fromAddId: "from",
      toAddId: "addTarget",
      movedId: "m",
      fromIndex: 0,
      toIndex: 1,
    };
    const wrap: MovePlan = {
      kind: "WrapIntoAddThenInsert",
      movedId: "m",
      fromAddId: "from",
      fromIndex: 0,
      replaceId: "replaceTarget",
      replaceParentId: "p",
      replaceSlot: 1,
      insertIndex: 0,
    };
    const moveAcrossEdge: MovePlan = {
      kind: "MoveAcrossEqual",
      movedId: "m",
      equalId: "eq",
      fromSide: 0,
      toSide: 1,
      drop: {
        kind: "ontoSideRoot",
        replaceId: "replaceTarget",
        replaceParentId: "eq",
        replaceSlot: 1,
        insertIndex: 0,
      },
    };
    const merge: MovePlan = {
      kind: "MergeIntoFractionNumerator",
      fromMulId: "mul",
      divideId: "divideId",
      movedId: "m",
    };
    const liftDot: MovePlan = {
      kind: "LiftDotScalar",
      dotId: "dotId",
      movedId: "m",
      operandIndex: 0,
      insertIndex: 1,
    };

    expect(targetRectForPlan(insert, rects)).toEqual(rect(0, 10));
    expect(targetRectForPlan(wrap, rects)).toEqual(rect(20, 30));
    expect(targetRectForPlan(moveAcrossEdge, rects)).toEqual(rect(20, 30));
    expect(targetRectForPlan(merge, rects)).toEqual(rect(40, 50));
    expect(targetRectForPlan(liftDot, rects)).toEqual(rect(60, 70));
  });
});
