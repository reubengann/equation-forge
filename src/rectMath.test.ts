import { describe, it, expect } from "vitest";
import { pickInsertSlot } from "./rectMath";
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
