import { describe, it, expect } from "vitest";
import { ExpressionTree, type MJ } from "./ExpressionTree";
import { ComputeEngine } from "@cortex-js/compute-engine";
import {
  ancestorsInclusive,
  lowestCommonAncestor,
  routeBetween,
  routeCrossesOp,
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
});
