import { describe, it, expect } from "vitest";
import { ExpressionTree, type MJ } from "./ExpressionTree";
import {
  normalizeSelection,
  expandSelection,
  type ExprSelection,
  chooseBestAllowedSelectedNode,
  getDescendantNodeIds,
  promoteSelection,
} from "./selectionSemantics";
import { findNodeId } from "./testHelpers";

describe("selectionSemantics.bubbleThroughUnary", () => {
  it("bubbles from a leaf under Negate up to the Negate node", () => {
    // Add(a, Negate(b))
    const mj: MJ = ["Add", "a", ["Negate", "b"]];
    const tree = ExpressionTree.create(mj);

    const bId = findNodeId(tree, (n: any) => n.latex === "b");
    const bubbled = normalizeSelection(tree, bId);

    expect(tree.nodesById[bubbled]?.op).toBe("Negate");
  });

  it("does not bubble past Negate into higher container nodes", () => {
    const mj: MJ = ["Add", "a", ["Negate", "b"]];
    const tree = ExpressionTree.create(mj);

    const bId = findNodeId(tree, (n: any) => n.latex === "b");
    const bubbled = normalizeSelection(tree, bId);

    // Parent of the Negate should be Add; we should stop at Negate.
    const parent = tree.parentById[bubbled];
    expect(parent).toBeTruthy();
    expect(tree.nodesById[parent!]?.op).toBe("Add");
    expect(tree.nodesById[bubbled]?.op).toBe("Negate");
  });

  it("returns the same id when node is not under a unary wrapper", () => {
    const mj: MJ = ["Add", "a", "b"];
    const tree = ExpressionTree.create(mj);

    const bId = findNodeId(tree, (n: any) => n.latex === "b");
    expect(normalizeSelection(tree, bId)).toBe(bId);
  });

  it("bubbles from a leaf under Negate up to the Negate node", () => {
    const mj: MJ = ["Add", "a", ["Negate", "b"]];
    const tree = ExpressionTree.create(mj);

    const bId = findNodeId(tree, (n: any) => n.latex === "b");
    const normId = normalizeSelection(tree, bId);

    expect(tree.nodesById[normId]?.op).toBe("Negate");
  });

  it("does not bubble past Negate into the parent container", () => {
    const mj: MJ = ["Add", "a", ["Negate", "b"]];
    const tree = ExpressionTree.create(mj);

    const bId = findNodeId(tree, (n: any) => n.latex === "b");
    const normId = normalizeSelection(tree, bId);

    expect(tree.nodesById[normId]?.op).toBe("Negate");
    const parentId = tree.parentById[normId];
    expect(parentId).toBeTruthy();
    expect(tree.nodesById[parentId!]?.op).toBe("Add");
  });

  it("returns same id when node is not under a unary wrapper", () => {
    const mj: MJ = ["Add", "a", "b"];
    const tree = ExpressionTree.create(mj);

    const bId = findNodeId(tree, (n: any) => n.latex === "b");
    expect(normalizeSelection(tree, bId)).toBe(bId);
  });

  it("node selection inside Add expands to a span (right)", () => {
    const mj: MJ = ["Add", "a", "b", "c"];
    const tree = ExpressionTree.create(mj);

    const bId = findNodeId(tree, (n: any) => n.latex === "b");

    const sel: ExprSelection = { kind: "node", nodeId: bId };
    const r = expandSelection(tree, sel, "right");
    expect(r).not.toBeNull();

    expect(r!.next.kind).toBe("span");
    const span = r!.next as Extract<ExprSelection, { kind: "span" }>;
    expect(span.op).toBe("Add");
    expect(span.start).toBe(1);
    expect(span.end).toBe(2);

    // overlay should cover b and c
    expect(r!.nodeIdsToOverlay.length).toBe(2);
    expect(r!.nodeIdsToOverlay[0]).toBe(bId);
  });

  it("node selection inside Add expands to a span (left)", () => {
    const mj: MJ = ["Add", "a", "b", "c"];
    const tree = ExpressionTree.create(mj);

    const bId = findNodeId(tree, (n: any) => n.latex === "b");

    const sel: ExprSelection = { kind: "node", nodeId: bId };
    const r = expandSelection(tree, sel, "left");
    expect(r).not.toBeNull();

    const span = r!.next as Extract<ExprSelection, { kind: "span" }>;
    expect(span.op).toBe("Add");
    expect(span.start).toBe(0);
    expect(span.end).toBe(1);

    // overlay should cover a and b (so last should be bId)
    expect(r!.nodeIdsToOverlay.length).toBe(2);
    expect(r!.nodeIdsToOverlay[1]).toBe(bId);
  });

  it("span selection inside Add expands further (right)", () => {
    const mj: MJ = ["Add", "a", "b", "c", "d"];
    const tree = ExpressionTree.create(mj);

    const addId = findNodeId(tree, (n: any) => n.op === "Add");
    const kids = tree.childrenById[addId] ?? [];
    expect(kids.length).toBe(4);

    // start with b..c
    const sel: ExprSelection = {
      kind: "span",
      parentId: addId,
      op: "Add",
      start: 1,
      end: 2,
    };

    const r = expandSelection(tree, sel, "right");
    expect(r).not.toBeNull();

    const span = r!.next as Extract<ExprSelection, { kind: "span" }>;
    expect(span.start).toBe(1);
    expect(span.end).toBe(3); // now b..d
    expect(r!.nodeIdsToOverlay).toEqual(kids.slice(1, 4));
  });

  it("returns null when node selection is not inside Add/Multiply", () => {
    const mj: MJ = ["Equal", "a", "b"];
    const tree = ExpressionTree.create(mj);

    const aId = findNodeId(tree, (n: any) => n.latex === "a");
    const sel: ExprSelection = { kind: "node", nodeId: aId };

    expect(expandSelection(tree, sel, "right")).toBeNull();
  });

  it("works for Multiply as well", () => {
    const mj: MJ = ["InvisibleOperator", "a", "b", "c"];
    const tree = ExpressionTree.create(mj);

    const bId = findNodeId(tree, (n: any) => n.latex === "b");
    const sel: ExprSelection = { kind: "node", nodeId: bId };

    const r = expandSelection(tree, sel, "right");
    expect(r).not.toBeNull();

    const span = r!.next as Extract<ExprSelection, { kind: "span" }>;
    expect(span.op).toBe("InvisibleOperator");
    expect(span.start).toBe(1);
    expect(span.end).toBe(2);
  });

  it("clamps span expansion at container boundaries", () => {
    const mj: MJ = ["Add", "a", "b"];
    const tree = ExpressionTree.create(mj);

    const addId = findNodeId(tree, (n: any) => n.op === "Add");
    const kids = tree.childrenById[addId] ?? [];
    expect(kids.length).toBe(2);

    const sel: ExprSelection = {
      kind: "span",
      parentId: addId,
      op: "Add",
      start: 0,
      end: 1,
    };

    // expand right past end -> should stay at end
    const r1 = expandSelection(tree, sel, "right");
    expect(r1).not.toBeNull();
    const s1 = r1!.next as Extract<ExprSelection, { kind: "span" }>;
    expect(s1.start).toBe(0);
    expect(s1.end).toBe(1);

    // expand left past start -> should stay at start
    const r2 = expandSelection(tree, sel, "left");
    expect(r2).not.toBeNull();
    const s2 = r2!.next as Extract<ExprSelection, { kind: "span" }>;
    expect(s2.start).toBe(0);
    expect(s2.end).toBe(1);

    expect(r1!.nodeIdsToOverlay).toEqual(kids);
    expect(r2!.nodeIdsToOverlay).toEqual(kids);
  });

  it("returns the first allowed node in the nodeIds list", () => {
    // a + b
    const mj: MJ = ["Add", "a", "b"];
    const tree = ExpressionTree.create(mj);

    const addId = findNodeId(tree, (n: any) => n.op === "Add");
    const aId = findNodeId(tree, (n: any) => n.latex === "a");

    // composedPath order is typically deepest -> shallowest:
    // leaf first, then container
    const nodeIds = [aId, addId];

    expect(chooseBestAllowedSelectedNode(nodeIds, tree)).toBe(aId);
  });

  it("skips disallowed ops like Add/Equal/InvisibleOperator", () => {
    // a + b = c
    const mj: MJ = ["Equal", ["Add", "a", "b"], "c"];
    const tree = ExpressionTree.create(mj);

    const eqId = findNodeId(tree, (n: any) => n.op === "Equal");
    const addId = findNodeId(tree, (n: any) => n.op === "Add");

    // Simulate clicking on '=' or '+': only structural nodes show up
    const nodeIds = [addId, eqId];

    expect(chooseBestAllowedSelectedNode(nodeIds, tree)).toBeNull();
  });

  it("returns null when all candidates are disallowed", () => {
    const mj: MJ = ["Add", "a", "b", "c"];
    const tree = ExpressionTree.create(mj);

    const addId = findNodeId(tree, (n: any) => n.op === "Add");

    expect(chooseBestAllowedSelectedNode([addId], tree)).toBeNull();
  });

  it("ignores unknown nodeIds (not present in tree.nodesById) and continues", () => {
    const mj: MJ = ["Add", "a", "b"];
    const tree = ExpressionTree.create(mj);

    const bId = findNodeId(tree, (n: any) => n.latex === "b");
    const addId = findNodeId(tree, (n: any) => n.op === "Add");

    // unknown id first, then a disallowed node, then an allowed leaf
    const nodeIds = ["does-not-exist", addId, bId];

    expect(chooseBestAllowedSelectedNode(nodeIds, tree)).toBe(bId);
  });

  it("treats implicit multiplication container (InvisibleOperator) as disallowed but still allows its terms", () => {
    // "a b c" represented as implicit multiplication
    const mj: MJ = ["InvisibleOperator", "a", "b", "c"];
    const tree = ExpressionTree.create(mj);

    const invId = findNodeId(tree, (n: any) => n.op === "InvisibleOperator");
    const bId = findNodeId(tree, (n: any) => n.latex === "b");

    // leaf then container
    const nodeIds = [bId, invId];

    expect(chooseBestAllowedSelectedNode(nodeIds, tree)).toBe(bId);
  });

  it("collects descendants without duplicates even if roots overlap", () => {
    const mj: MJ = ["Add", "a", ["Negate", "b"]];
    const tree = ExpressionTree.create(mj);

    const addId = findNodeId(tree, (n: any) => n.op === "Add");
    const negId = findNodeId(tree, (n: any) => n.op === "Negate");

    const ids = getDescendantNodeIds(tree, [addId, negId]);

    expect(ids).toContain(addId);
    expect(ids).toContain(negId);
    expect(ids.filter((v, i) => ids.indexOf(v) === i).length).toBe(ids.length);
  });

  it("promotes selection upward and stops before Equal", () => {
    const mj: MJ = ["Equal", ["Add", ["Negate", "a"], "b"], "c"];
    const tree = ExpressionTree.create(mj);

    const aId = findNodeId(tree, (n: any) => n.latex === "a");
    const negateId = tree.parentById[aId]!;
    const addId = tree.parentById[negateId]!;
    const equalId = tree.parentById[addId]!;

    expect(promoteSelection(tree, aId, 0)).toBe(aId);
    expect(promoteSelection(tree, aId, 1)).toBe(negateId);
    expect(promoteSelection(tree, aId, 2)).toBe(addId);
    expect(promoteSelection(tree, aId, 3)).toBe(addId); // stop before Equal
    expect(promoteSelection(tree, equalId, 1)).toBe(equalId); // cannot climb past Equal
  });

  it("normalizeSelection bubbles through Subscript so v selects v_x", () => {
    const mj: MJ = ["Subscript", "v", "x"];
    const tree = ExpressionTree.create(mj);

    const vId = findNodeId(tree, (n: any) => n.latex === "v");
    const subId = tree.parentById[vId];
    expect(subId).toBeTruthy();
    const norm = normalizeSelection(tree, vId);
    expect(norm).toBe(subId);
  });

  it("normalizeSelection bubbles through OverDot so clicking x selects \\dot{x}", () => {
    const mj: MJ = ["OverDot", "x"];
    const tree = ExpressionTree.create(mj);

    const xId = findNodeId(tree, (n: any) => n.latex === "x");
    const dotId = tree.parentById[xId];
    expect(dotId).toBeTruthy();
    const norm = normalizeSelection(tree, xId);
    expect(norm).toBe(dotId);
  });
});
