import { describe, it, expect } from "vitest";
import { pickInsertSlot, unionRects, type RectLTRB } from "./rectMath";
describe("pickInsertSlot (insertion slots)", () => {
  it("returns no slot when x is too far left of the first item", () => {
    const rects = [
      { left: 10, right: 30, top: 0, bottom: 10 },
      { left: 40, right: 60, top: 0, bottom: 10 },
    ];
    expect(pickInsertSlot(rects, 0, 5)).toBe(null); // 0 < (10-5)
    expect(pickInsertSlot(rects, 19, 5)).toBe(0); // inside first => before its midpoint
  });

  it("for 2 items: midpoint of each item is the boundary", () => {
    const rects = [
      { left: 10, right: 30, top: 0, bottom: 10 }, // A
      { left: 40, right: 60, top: 0, bottom: 10 }, // B
    ];
    const midA = (10 + 30) / 2; // 20
    const midB = (40 + 60) / 2; // 50

    // Before midpoint of A -> slot 0
    expect(pickInsertSlot(rects, midA - 1, 0)).toBe(0);

    // At/after midpoint of A but before midpoint of B -> slot 1
    expect(pickInsertSlot(rects, midA, 0)).toBe(1);
    expect(pickInsertSlot(rects, midA + 1, 0)).toBe(1);
    expect(pickInsertSlot(rects, midB - 1, 0)).toBe(1);

    // At/after midpoint of B -> slot 2
    expect(pickInsertSlot(rects, midB, 0)).toBe(2);
    expect(pickInsertSlot(rects, midB + 1, 0)).toBe(2);
  });

  it("for 3 items: can return 0, 1, 2, or 3", () => {
    const rects = [
      { left: 10, right: 30, top: 0, bottom: 10 }, // A
      { left: 40, right: 60, top: 0, bottom: 10 }, // B
      { left: 80, right: 100, top: 0, bottom: 10 }, // C
    ];
    const midA = (10 + 30) / 2; // 20
    const midB = (40 + 60) / 2; // 50
    const midC = (80 + 100) / 2; // 90

    expect(pickInsertSlot(rects, midA - 1, 0)).toBe(0); // before A midpoint
    expect(pickInsertSlot(rects, midA, 0)).toBe(1); // boundary to B

    expect(pickInsertSlot(rects, midB - 1, 0)).toBe(1); // still before B midpoint
    expect(pickInsertSlot(rects, midB, 0)).toBe(2); // boundary to C

    expect(pickInsertSlot(rects, midC - 1, 0)).toBe(2); // before C midpoint
    expect(pickInsertSlot(rects, midC, 0)).toBe(3); // after last midpoint
  });

  it("returns null for empty rect list", () => {
    expect(pickInsertSlot([], 10, 5)).toBe(null);
  });
});

describe("unionRects", () => {
  it("returns null for empty input", () => {
    expect(unionRects([])).toBeNull();
  });

  it("returns the same rect for a single rect", () => {
    const r: RectLTRB = {
      left: 10,
      top: 20,
      right: 30,
      bottom: 40,
    };

    expect(unionRects([r])).toEqual(r);
  });

  it("unions multiple rects by min/max of edges", () => {
    const rects: RectLTRB[] = [
      { left: 10, top: 10, right: 30, bottom: 30 },
      { left: 5, top: 20, right: 40, bottom: 25 },
      { left: 15, top: 0, right: 20, bottom: 50 },
    ];

    const u = unionRects(rects)!;

    expect(u).toEqual({
      left: 5, // min left
      top: 0, // min top
      right: 40, // max right
      bottom: 50, // max bottom
    });
  });

  it("handles negative coordinates correctly", () => {
    const rects: RectLTRB[] = [
      { left: -10, top: -5, right: 10, bottom: 5 },
      { left: -20, top: 0, right: 0, bottom: 20 },
    ];

    expect(unionRects(rects)).toEqual({
      left: -20,
      top: -5,
      right: 10,
      bottom: 20,
    });
  });

  it("does not mutate input rects", () => {
    const rects: RectLTRB[] = [
      { left: 0, top: 0, right: 10, bottom: 10 },
      { left: 5, top: 5, right: 15, bottom: 15 },
    ];

    const copy = rects.map((r) => ({ ...r }));
    unionRects(rects);

    expect(rects).toEqual(copy);
  });
});
