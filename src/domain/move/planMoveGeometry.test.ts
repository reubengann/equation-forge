import { describe, expect, it } from "vitest";
import {
  computeSlotByMidpoints,
  determineMultiplicativeDropKind,
  type RectProvider,
} from "./planMoveGeometry";
import type { RectLTRB } from "../../rectMath";

function makeRect(
  left: number,
  right: number,
  top = 0,
  bottom = 20
): RectLTRB {
  return { left, right, top, bottom };
}

function rectProvider(rects: Record<string, RectLTRB | null>): RectProvider {
  return (id) => rects[id] ?? null;
}

describe("computeSlotByMidpoints", () => {
  const childIds = ["a", "b", "c"];

  it("returns 0 when pointer is left of the first midpoint", () => {
    const rects = rectProvider({
      a: makeRect(10, 20),
      b: makeRect(40, 50),
      c: makeRect(70, 80),
    });

    const slot = computeSlotByMidpoints({
      childIds,
      pointerX: 5,
      rectFor: rects,
    });

    expect(slot).toBe(0);
  });

  it("returns n when pointer is right of all midpoints", () => {
    const rects = rectProvider({
      a: makeRect(10, 20),
      b: makeRect(40, 50),
      c: makeRect(70, 80),
    });

    const slot = computeSlotByMidpoints({
      childIds,
      pointerX: 200,
      rectFor: rects,
    });

    expect(slot).toBe(3);
  });

  it("skips null rects but still produces a sensible slot", () => {
    const rects = rectProvider({
      a: null,
      b: makeRect(100, 120),
      c: makeRect(150, 170),
    });

    const slot = computeSlotByMidpoints({
      childIds,
      pointerX: 90,
      rectFor: rects,
    });

    // Pointer is left of midpoint of b (index 1)
    expect(slot).toBe(1);
  });
});

describe("determineMultiplicativeDropKind", () => {
  const baseRect = makeRect(100, 160, 0, 20);

  it("returns null when the side root rect is missing", () => {
    const kind = determineMultiplicativeDropKind({
      sideRootId: "side",
      pointer: { x: 120, y: 10 },
      rectFor: rectProvider({ side: null }),
      equalId: "eq",
      toSide: 0,
    });
    expect(kind).toBeNull();
  });

  it("returns ontoSideRoot left/right when pointer is outside rect", () => {
    const rects = rectProvider({ side: baseRect });

    const left = determineMultiplicativeDropKind({
      sideRootId: "side",
      pointer: { x: 70, y: 10 },
      rectFor: rects,
      equalId: "eq",
      toSide: 1,
    });
    const right = determineMultiplicativeDropKind({
      sideRootId: "side",
      pointer: { x: 190, y: 10 },
      rectFor: rects,
      equalId: "eq",
      toSide: 1,
    });

    expect(left).toEqual({
      kind: "ontoSideRoot",
      replaceId: "side",
      replaceParentId: "eq",
      replaceSlot: 1,
      insertIndex: 0,
    });
    expect(right).toEqual({
      kind: "ontoSideRoot",
      replaceId: "side",
      replaceParentId: "eq",
      replaceSlot: 1,
      insertIndex: 1,
    });
  });

  it("uses edge zones when rect is wide enough", () => {
    const rects = rectProvider({ side: baseRect });

    const leftEdge = determineMultiplicativeDropKind({
      sideRootId: "side",
      pointer: { x: baseRect.left + 1, y: 10 },
      rectFor: rects,
      equalId: "eq",
      toSide: 0,
    });
    const rightEdge = determineMultiplicativeDropKind({
      sideRootId: "side",
      pointer: { x: baseRect.right - 1, y: 10 },
      rectFor: rects,
      equalId: "eq",
      toSide: 0,
    });

    expect(leftEdge).toEqual({
      kind: "ontoSideRoot",
      replaceId: "side",
      replaceParentId: "eq",
      replaceSlot: 0,
      insertIndex: 0,
    });
    expect(rightEdge).toEqual({
      kind: "ontoSideRoot",
      replaceId: "side",
      replaceParentId: "eq",
      replaceSlot: 0,
      insertIndex: 1,
    });
  });

  it("falls back to whole-body drop when rect is too narrow for edge zones", () => {
    const narrowRect = makeRect(100, 128, 0, 20); // width < 36 so no edge zones
    const rects = rectProvider({ side: narrowRect });

    const drop = determineMultiplicativeDropKind({
      sideRootId: "side",
      pointer: { x: 110, y: 10 },
      rectFor: rects,
      equalId: "eq",
      toSide: 0,
    });

    expect(drop).toEqual({
      kind: "ontoSideRootWhole",
      replaceId: "side",
      replaceParentId: "eq",
      replaceSlot: 0,
    });
  });
});
