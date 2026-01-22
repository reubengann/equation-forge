import { describe, expect, it } from "vitest";
import {
  describeMovePlan,
  planToApplyMoveTarget,
} from "./movePlanAdapters";
import type { MovePlan } from "./planMove";

describe("describeMovePlan", () => {
  it("describes a null plan", () => {
    expect(describeMovePlan(null)).toBe(
      "No move intent (planMove returned null)"
    );
  });

  it("describes each MovePlan variant", () => {
    const reorder: MovePlan = {
      kind: "ReorderAdd",
      addId: "add1",
      movedId: "n2",
      fromIndex: 2,
      toIndex: 0,
    };
    const insert: MovePlan = {
      kind: "InsertIntoAdd",
      fromAddId: "fromA",
      toAddId: "toA",
      movedId: "m",
      fromIndex: 1,
      toIndex: 3,
    };
    const wrap: MovePlan = {
      kind: "WrapIntoAddThenInsert",
      movedId: "m",
      fromAddId: "fromA",
      fromIndex: 0,
      replaceId: "r",
      replaceParentId: "p",
      replaceSlot: 1,
      insertIndex: 0,
    };
    const factor: MovePlan = {
      kind: "FactorOutOfIntegrate",
      movedId: "m",
      fromMulId: "mul",
      fromIndex: 1,
      integrateId: "int",
      insertIndex: 1,
    };
    const merge: MovePlan = {
      kind: "MergeIntoFractionNumerator",
      fromMulId: "mul",
      divideId: "div",
      movedId: "m",
    };
    const moveAcrossIntoAdd: MovePlan = {
      kind: "MoveAcrossEqual",
      movedId: "m",
      equalId: "eq",
      fromSide: 0,
      toSide: 1,
      drop: { kind: "intoAdd", addId: "addRhs", toIndex: 2 },
    };
    const moveAcrossWhole: MovePlan = {
      ...moveAcrossIntoAdd,
      drop: {
        kind: "ontoSideRootWhole",
        replaceId: "rhsRoot",
        replaceParentId: "eq",
        replaceSlot: 1,
      },
    };
    const moveAcrossEdge: MovePlan = {
      ...moveAcrossIntoAdd,
      drop: {
        kind: "ontoSideRoot",
        replaceId: "rhsRoot",
        replaceParentId: "eq",
        replaceSlot: 1,
        insertIndex: 1,
      },
    };
    const liftDot: MovePlan = {
      kind: "LiftDotScalar",
      dotId: "dot1",
      movedId: "m",
      operandIndex: 0,
      insertIndex: 1,
    };

    expect(describeMovePlan(reorder)).toBe(
      "Reorder n2 within Add add1 from 2 to 0"
    );
    expect(describeMovePlan(insert)).toBe(
      "Insert m from Add fromA[1] into Add toA at slot 3"
    );
    expect(describeMovePlan(wrap)).toBe(
      "Wrap r (slot 1) under parent p — then insert m from Add fromA[0] before it"
    );
    expect(describeMovePlan(factor)).toBe(
      "Factor m out of Integrate int and place after it"
    );
    expect(describeMovePlan(merge)).toBe(
      "Merge m into numerator of fraction div"
    );
    expect(describeMovePlan(moveAcrossIntoAdd)).toBe(
      "Move m across '=' LHS → RHS into Add addRhs at slot 2"
    );
    expect(describeMovePlan(moveAcrossWhole)).toBe(
      "Move m across '=' LHS → RHS dividing whole expression rhsRoot"
    );
    expect(describeMovePlan(moveAcrossEdge)).toBe(
      "Move m across '=' LHS → RHS by wrapping rhsRoot and inserting after"
    );
    expect(describeMovePlan(liftDot)).toBe(
      "Lift scalar m out of DotProduct dot1 and place after it"
    );
  });
});

describe("planToApplyMoveTarget", () => {
  it("maps reorder plan to hover + slot with reorder offset", () => {
    const moveEarlier: MovePlan = {
      kind: "ReorderAdd",
      addId: "add1",
      movedId: "x",
      fromIndex: 2,
      toIndex: 0,
    };
    const moveLater: MovePlan = {
      ...moveEarlier,
      fromIndex: 0,
      toIndex: 2,
    };

    expect(planToApplyMoveTarget(moveEarlier)).toEqual({
      hoverId: "add1",
      targetSlot: 0,
    });
    expect(planToApplyMoveTarget(moveLater)).toEqual({
      hoverId: "add1",
      targetSlot: 3,
    });
  });

  it("maps plan kinds to expected hover/slot targets", () => {
    const wrap: MovePlan = {
      kind: "WrapIntoAddThenInsert",
      movedId: "m",
      fromAddId: "fromA",
      fromIndex: 0,
      replaceId: "r",
      replaceParentId: "p",
      replaceSlot: 1,
      insertIndex: 1,
    };
    const moveAcrossIntoAdd: MovePlan = {
      kind: "MoveAcrossEqual",
      movedId: "m",
      equalId: "eq",
      fromSide: 0,
      toSide: 1,
      drop: { kind: "intoAdd", addId: "addRhs", toIndex: 2 },
    };
    const moveAcrossWhole: MovePlan = {
      ...moveAcrossIntoAdd,
      drop: {
        kind: "ontoSideRootWhole",
        replaceId: "rhsRoot",
        replaceParentId: "eq",
        replaceSlot: 1,
      },
    };
    const moveAcrossEdge: MovePlan = {
      ...moveAcrossIntoAdd,
      drop: {
        kind: "ontoSideRoot",
        replaceId: "rhsRoot",
        replaceParentId: "eq",
        replaceSlot: 1,
        insertIndex: 0,
      },
    };
    const factor: MovePlan = {
      kind: "FactorOutOfIntegrate",
      movedId: "m",
      fromMulId: "mul",
      fromIndex: 1,
      integrateId: "int",
      insertIndex: 0,
    };

    expect(planToApplyMoveTarget(wrap)).toEqual({
      hoverId: "r",
      targetSlot: 1,
    });
    expect(planToApplyMoveTarget(moveAcrossIntoAdd)).toEqual({
      hoverId: "addRhs",
      targetSlot: 2,
    });
    expect(planToApplyMoveTarget(moveAcrossWhole)).toEqual({
      hoverId: "rhsRoot",
      targetSlot: null,
    });
    expect(planToApplyMoveTarget(moveAcrossEdge)).toEqual({
      hoverId: "rhsRoot",
      targetSlot: 0,
    });
    expect(planToApplyMoveTarget(factor)).toEqual({
      hoverId: "int",
      targetSlot: 0,
    });
  });
});
