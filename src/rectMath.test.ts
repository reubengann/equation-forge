import { describe, it, expect } from "vitest";
import { pickInsertSlot, unionRects, type RectLTRB } from "./rectMath";
describe("pickInsertSlot (insertion slots)", () => {
  it("returns no slot when x is too far left of the first item", () => {
    const rects = [
      { left: 10, right: 30, top: 0, bottom: 10 },
      { left: 40, right: 60, top: 0, bottom: 10 },
    ];
    expect(pickInsertSlot(rects, 0, 5)).toBe(null); // 0 < (10-5)
    expect(pickInsertSlot(rects, 19, 5)).toBe(0); // inside/near first => before first gap boundary
  });

  it("for 2 items: uses gap midpoint to choose slot 0 vs 1, and last midpoint to choose 1 vs 2", () => {
    const rects = [
      { left: 10, right: 30, top: 0, bottom: 10 }, // A
      { left: 40, right: 60, top: 0, bottom: 10 }, // B
    ];
    const gapMid = (30 + 40) / 2; // 35
    const lastMid = (40 + 60) / 2; // 50

    // Left of / at the gap midpoint => slot 0 (before B / between "before first" vs "between")
    expect(pickInsertSlot(rects, gapMid, 0)).toBe(0);
    expect(pickInsertSlot(rects, gapMid - 1, 0)).toBe(0);

    // Just right of gap midpoint but still on left half of last item => slot 1 (between A and B)
    expect(pickInsertSlot(rects, gapMid + 1, 0)).toBe(1);
    expect(pickInsertSlot(rects, lastMid, 0)).toBe(1);

    // Right of last midpoint => slot 2 (after last)
    expect(pickInsertSlot(rects, lastMid + 1, 0)).toBe(2);
  });

  it("for 3 items: can return 0, 1, 2, or 3", () => {
    const rects = [
      { left: 10, right: 30, top: 0, bottom: 10 }, // A
      { left: 40, right: 60, top: 0, bottom: 10 }, // B
      { left: 80, right: 100, top: 0, bottom: 10 }, // C
    ];
    const midAB = (30 + 40) / 2; // 35
    const midBC = (60 + 80) / 2; // 70
    const midC = (80 + 100) / 2; // 90

    expect(pickInsertSlot(rects, midAB, 0)).toBe(0);
    expect(pickInsertSlot(rects, midAB + 1, 0)).toBe(1);

    expect(pickInsertSlot(rects, midBC, 0)).toBe(1);
    expect(pickInsertSlot(rects, midBC + 1, 0)).toBe(2);

    // last item midpoint splits slot 2 vs 3
    expect(pickInsertSlot(rects, midC, 0)).toBe(2);
    expect(pickInsertSlot(rects, midC + 1, 0)).toBe(3);
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
