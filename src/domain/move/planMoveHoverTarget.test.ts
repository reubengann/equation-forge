import { describe, expect, it } from "vitest";
import { ExpressionTree } from "../../ExpressionTree";
import {
  isAncestorOrSelf,
  resolveHoverTarget,
  type HoverTarget,
} from "./planMoveHoverTarget";
import type { RectProvider } from "./planMoveGeometry";
import type { RectLTRB } from "../../rectMath";

function rect(left: number, right: number, top = 0, bottom = 10): RectLTRB {
  return { left, right, top, bottom };
}

function rectFor(rects: Record<string, RectLTRB | null>): RectProvider {
  return (id) => rects[id] ?? null;
}

const isAdd = (op?: string) => op === "Add";

function idByPath(tree: ExpressionTree, path: number[]): string {
  return tree.idByPath[path.join(".")];
}

describe("isAncestorOrSelf", () => {
  const tree = ExpressionTree.create(["Add", "a", "b"]);
  const rootId = tree.rootId;
  const firstChild = idByPath(tree, [1]);

  it("returns true for ancestor and self", () => {
    expect(isAncestorOrSelf(tree, rootId, firstChild)).toBe(true);
    expect(isAncestorOrSelf(tree, firstChild, firstChild)).toBe(true);
  });

  it("returns false for unrelated nodes", () => {
    expect(isAncestorOrSelf(tree, firstChild, rootId)).toBe(false);
  });
});

describe("resolveHoverTarget", () => {
  it("prefers the closest container ancestor that contains the pointer", () => {
    // Tree: Add(root) -> Add(inner) -> a,b ; plus leaf c
    const tree = ExpressionTree.create(["Add", ["Add", "a", "b"], "c"]);
    const innerAddId = idByPath(tree, [1]);
    const rootAddId = tree.rootId;
    const aId = idByPath(tree, [1, 1]);

    const rects = rectFor({
      [innerAddId]: rect(0, 50),
      [rootAddId]: rect(0, 100),
    });

    const target = resolveHoverTarget({
      tree,
      hoverId: aId,
      pointer: { x: 10, y: 5 },
      rectFor: rects,
      isContainerOp: isAdd,
    });

    const expected: HoverTarget = { kind: "add", addId: innerAddId };
    expect(target).toEqual(expected);
  });

  it("selects the LHS add when pointer is unambiguously inside the left side", () => {
    const tree = ExpressionTree.create([
      "Equal",
      ["Add", "a", "b"],
      ["Add", "c", "d"],
    ]);
    const equalId = tree.rootId;
    const lhsId = idByPath(tree, [1]);
    const rhsId = idByPath(tree, [2]);

    const rects = rectFor({
      [lhsId]: rect(0, 40),
      [rhsId]: rect(70, 110),
      [equalId]: rect(45, 65),
    });

    const target = resolveHoverTarget({
      tree,
      hoverId: equalId,
      pointer: { x: 10, y: 5 },
      rectFor: rects,
      isContainerOp: isAdd,
    });

    expect(target).toEqual({ kind: "add", addId: lhsId });
  });

  it("falls back to equal midpoint when sides are ambiguous", () => {
    const tree = ExpressionTree.create([
      "Equal",
      ["Add", "a", "b"],
      ["Add", "c", "d"],
    ]);
    const equalId = tree.rootId;
    const lhsId = idByPath(tree, [1]);
    const rhsId = idByPath(tree, [2]);

    const rects = rectFor({
      [lhsId]: rect(0, 30),
      [rhsId]: rect(80, 120),
      [equalId]: rect(40, 80),
    });

    // Pointer between lhs and rhs but left of equal midpoint (mid = 60)
    const target = resolveHoverTarget({
      tree,
      hoverId: equalId,
      pointer: { x: 55, y: 5 },
      rectFor: rects,
      isContainerOp: isAdd,
    });

    expect(target).toEqual({ kind: "add", addId: lhsId });
  });

  it("uses midpoint fallback when one side rect is missing", () => {
    const tree = ExpressionTree.create([
      "Equal",
      ["Add", "a", "b"],
      ["Add", "c", "d"],
    ]);
    const equalId = tree.rootId;
    const lhsId = idByPath(tree, [1]);
    const rhsId = idByPath(tree, [2]);

    const rects = rectFor({
      [lhsId]: null,
      [rhsId]: rect(90, 130),
      [equalId]: rect(60, 100),
    });

    // Pointer right of midpoint => choose RHS even though LHS rect missing
    const target = resolveHoverTarget({
      tree,
      hoverId: equalId,
      pointer: { x: 95, y: 5 },
      rectFor: rects,
      isContainerOp: isAdd,
    });

    expect(target).toEqual({ kind: "add", addId: rhsId });
  });

  it("returns replace target when chosen side root is not a container", () => {
    const tree = ExpressionTree.create(["Equal", "x", "y"]);
    const equalId = tree.rootId;
    const lhsId = idByPath(tree, [1]);
    const rhsId = idByPath(tree, [2]);

    const rects = rectFor({
      [lhsId]: rect(0, 20),
      [rhsId]: rect(40, 60),
      [equalId]: rect(25, 35),
    });

    const target = resolveHoverTarget({
      tree,
      hoverId: equalId,
      pointer: { x: 10, y: 5 },
      rectFor: rects,
      isContainerOp: isAdd,
    });

    expect(target).toEqual({
      kind: "replace",
      replaceId: lhsId,
      replaceParentId: equalId,
      replaceSlot: 0,
    });
  });
});
