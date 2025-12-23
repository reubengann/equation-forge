import { describe, it, expect } from "vitest";
import { ExpressionTree, type MJ } from "./ExpressionTree";
import { ComputeEngine } from "@cortex-js/compute-engine";
import {
  ancestorsInclusive,
  computeDestinationIndex,
  getAtPath,
  isStructurallyValidMove,
  lowestCommonAncestor,
  reorderAddAtPath,
  routeBetween,
  routeCrossesOp,
  setAtPath,
} from "./movePath";

const ce = new ComputeEngine();

function makeMJfromLatex(x: string): MJ {
  return ce.parse(x, { canonical: false }).json as MJ;
}

describe("movePath", () => {
  it("computes ancestors from a leaf to root", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a - b = c"));
    const bId = Object.values(t.nodesById).find(
      (n) => n.op === "Symbol" && n.json === "b"
    )!.id;

    const ancs = ancestorsInclusive(t, bId);
    expect(ancs[0]).toBe(bId);
    expect(t.nodesById[ancs[1]].op).toBe("Negate");
    expect(ancs[ancs.length - 1]).toBe(t.rootId);
  });

  it("finds LCA between two leaves", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a - b = c"));

    const aId = Object.values(t.nodesById).find(
      (n) => n.op === "Symbol" && n.json === "a"
    )!.id;
    const bId = Object.values(t.nodesById).find(
      (n) => n.op === "Symbol" && n.json === "b"
    )!.id;

    const lca = lowestCommonAncestor(t, aId, bId);

    expect(t.nodesById[lca!].op).toBe("Add");
  });

  it("routeBetween returns null if a node id is unknown", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b"));
    const aId = Object.values(t.nodesById).find(
      (n) => n.op === "Symbol" && n.json === "a"
    )!.id;

    expect(routeBetween(t, aId, "nope")).toBeNull();
  });

  it("routeBetween preserves endpoints", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b + c"));
    const aId = Object.values(t.nodesById).find(
      (n) => n.op === "Symbol" && n.json === "a"
    )!.id;
    const cId = Object.values(t.nodesById).find(
      (n) => n.op === "Symbol" && n.json === "c"
    )!.id;

    const r = routeBetween(t, aId, cId)!;
    expect(r.fromId).toBe(aId);
    expect(r.toId).toBe(cId);
  });

  it("routeCrossesOp is false when op is absent", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b + c"));
    const aId = Object.values(t.nodesById).find(
      (n) => n.op === "Symbol" && n.json === "a"
    )!.id;
    const cId = Object.values(t.nodesById).find(
      (n) => n.op === "Symbol" && n.json === "c"
    )!.id;

    const route = routeBetween(t, aId, cId)!;
    expect(routeCrossesOp(t, route, "Equal")).toBe(false);
  });

  it("bans moving an Add term into a fraction denominator", () => {
    const t = ExpressionTree.create(makeMJfromLatex("(a + b) / c = d"));

    const aId = Object.values(t.nodesById).find(
      (n) => n.op === "Symbol" && n.json === "a"
    )!.id;
    const cId = Object.values(t.nodesById).find(
      (n) => n.op === "Symbol" && n.json === "c"
    )!.id;

    // pretend drop target is inside denominator (selecting c is good enough for now)
    const ban = isStructurallyValidMove(t, aId, cId);
    expect(ban).not.toBeNull();
    expect(ban!.reason).toMatch(/denominator/i);
  });

  it("allows moving an Add term within the same Add", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b + c"));

    const aId = Object.values(t.nodesById).find(
      (n) => n.op === "Symbol" && n.json === "a"
    )!.id;
    const cId = Object.values(t.nodesById).find(
      (n) => n.op === "Symbol" && n.json === "c"
    )!.id;

    const ban = isStructurallyValidMove(t, aId, cId);
    expect(ban).toBeNull();
  });

  it("getAtPath returns root when path is empty", () => {
    const root: MJ = ["Add", "a", "b"];
    expect(getAtPath(root, [])).toEqual(root);
  });

  it("setAtPath replaces a nested node immutably", () => {
    const root: MJ = ["Equal", ["Add", "a", "b"], "c"];

    const next = setAtPath(root, [1], ["Add", "x", "y"]) as MJ;

    // root unchanged
    expect(root).toEqual(["Equal", ["Add", "a", "b"], "c"]);
    // updated
    expect(next).toEqual(["Equal", ["Add", "x", "y"], "c"]);
    // structural sharing: top-level array is new
    expect(next).not.toBe(root);
  });

  it("reorderAddAtPath moves a term within an Add node", () => {
    // Equal(Add(a,b,c), d)
    const root: MJ = ["Equal", ["Add", "a", "b", "c"], "d"];

    // move "a" (index 0) after "c" => b,c,a
    const next = reorderAddAtPath(root, [1], 0, 2);

    expect(next).toEqual(["Equal", ["Add", "b", "c", "a"], "d"]);
    expect(next).not.toBe(root);
  });

  it("reorderAddAtPath is a no-op when target at path is not Add", () => {
    const root: MJ = ["Equal", ["Multiply", "a", "b"], "c"];
    const next = reorderAddAtPath(root, [1], 0, 1);
    expect(next).toBe(root); // returns original reference on no-op
  });

  it("reorderAddAtPath is a no-op for invalid indices or identical indices", () => {
    const root: MJ = ["Add", "a", "b", "c"];

    expect(reorderAddAtPath(root, [], 1, 1)).toBe(root);
    expect(reorderAddAtPath(root, [], -1, 1)).toBe(root);
    expect(reorderAddAtPath(root, [], 999, 1)).toBe(root);
  });

  it("computeDestinationIndex adjusts for removal when hovering to the right", () => {
    // If dragged item is removed, inserting after it shifts left by 1.
    // fromIndex=1, hoveredSlot=3 => destination index = 2
    expect(computeDestinationIndex(3, 1)).toBe(2);

    // hovering before or at the fromIndex doesn't shift
    expect(computeDestinationIndex(0, 1)).toBe(0);
    expect(computeDestinationIndex(1, 1)).toBe(1);
  });
});
