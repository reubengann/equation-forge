import { describe, expect, it } from "vitest";
import {
  hasVectorAncestor,
  isVectorNode,
  normalizeDragHandleId,
  normalizeSelectedIdsForMove,
} from "./moveSelectionPolicy";
import { treefromLatex, findNodeId, findNodeByLatex } from "../../testHelpers";

describe("moveSelectionPolicy", () => {
  it("promotes single factor to product in multiplicative mode when under Equal", () => {
    const tree = treefromLatex("a b = c");
    const aId = findNodeByLatex(tree, "a");
    const productId = tree.parentById[aId];

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [aId],
      mode: "multiplicative",
      hoverId: null,
    });

    expect(result).toEqual([productId]);
  });

  it("does not promote when product contains a vector sibling", () => {
    const tree = treefromLatex(String.raw`\vec{F} = m \vec{a}`);
    const mId = findNodeByLatex(tree, "m");
    const productId = tree.parentById[mId];
    if (!productId) {
      throw new Error("Expected product parent for m");
    }

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [mId],
      mode: "multiplicative",
      hoverId: null,
    });

    expect(result).toEqual([mId]);
    const vectorSiblingId = (tree.childrenById[productId] ?? []).find(
      (id) => id !== mId
    );
    expect(
      isVectorNode(vectorSiblingId ? tree.nodesById[vectorSiblingId] : undefined)
    ).toBe(true);
  });

  it("does not promote when product contains an overdotted sibling", () => {
    const tree = treefromLatex(String.raw`m \ddot{x} = F_{g} \sin\left(\theta\right)`);
    const mId = findNodeByLatex(tree, "m");

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [mId],
      mode: "multiplicative",
      hoverId: null,
    });

    expect(result).toEqual([mId]);
  });

  it("promotes single factor to product in additive mode when product is under Equal", () => {
    const tree = treefromLatex("a b = c");
    const bId = findNodeByLatex(tree, "b");
    const productId = tree.parentById[bId];

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [bId],
      mode: "additive",
      hoverId: null,
    });

    expect(result).toEqual([productId]);
  });

  it("promotes additive factor in mixed fraction product when hovering across '=' (issue 70)", () => {
    const tree = treefromLatex(
      String.raw`\frac{c_{P}}{R} \ln\left(T\right) - \frac{c_{P}}{R} \ln\left(T_{0}\right) - \ln\left(P + b\right) = -\ln\left(P_{0} + b\right)`
    );
    const lnT0Id = findNodeByLatex(tree, String.raw`\ln\left(T_{0}\right)`);
    const productId = tree.parentById[lnT0Id];
    const rhsId = tree.childrenById[tree.rootId!]?.[1] ?? null;

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [lnT0Id],
      mode: "additive",
      hoverId: rhsId,
    });

    expect(result).toEqual([productId]);
  });

  it("promotes nested fraction numerator symbol to additive term across '=' (issue 70)", () => {
    const tree = treefromLatex(
      String.raw`\frac{c_{P}}{R} \ln\left(T\right) - \frac{c_{P}}{R} \ln\left(T_{0}\right) - \ln\left(P + b\right) = -\ln\left(P_{0} + b\right)`
    );
    const cId = findNodeByLatex(tree, String.raw`c_{P}`);
    const rhsId = tree.childrenById[tree.rootId!]?.[1] ?? null;
    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [cId],
      mode: "additive",
      hoverId: rhsId,
    });
    expect(result.length).toBe(1);
    expect(tree.nodesById[result[0]]?.op).toBe("InvisibleOperator");
    expect(tree.nodesById[result[0]]?.latex).toContain(String.raw`\ln\left(T\right)`);
  });

  it("keeps explicit multi-factor selection in multiplicative mode", () => {
    const tree = treefromLatex("a b c");
    const aId = findNodeByLatex(tree, "a");
    const bId = findNodeByLatex(tree, "b");
    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [aId, bId],
      mode: "multiplicative",
      hoverId: null,
    });

    expect(result).toEqual([aId, bId]);
  });

  it("collapses factors to product in additive mode only when product is under Equal", () => {
    const tree = treefromLatex("a b = c");
    const aId = findNodeByLatex(tree, "a");
    const bId = findNodeByLatex(tree, "b");
    const productId = tree.parentById[aId];

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [aId, bId],
      mode: "additive",
      hoverId: null,
    });

    expect(result).toEqual([productId]);
  });

  it("promotes descendant multi-selection to contiguous Add terms in additive mode (issue 79)", () => {
    const tree = treefromLatex(
      String.raw`c_{v}\mathrm{d}{T} + \frac{a}{v^{2}}\mathrm{d}{v} + P\mathrm{d}{v} = 0`
    );
    const dvFromFraction = findNodeId(
      tree,
      (n) =>
        n.latex === String.raw`\mathrm{d}{v}` &&
        tree.nodesById[tree.parentById[n.id] ?? ""]?.op === "InvisibleOperator"
    );
    const pId = findNodeByLatex(tree, "P");
    const lhsAddId = tree.childrenById[tree.rootId!]?.[0];
    expect(lhsAddId).toBeTruthy();

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [dvFromFraction, pId],
      mode: "additive",
      hoverId: tree.childrenById[tree.rootId!]?.[1] ?? null,
    });

    const addKids = tree.childrenById[lhsAddId!] ?? [];
    expect(result).toEqual([addKids[1], addKids[2]]);
  });

  it("keeps original factor when hovering within same product in multiplicative mode", () => {
    const tree = treefromLatex("a b = c");
    const aId = findNodeByLatex(tree, "a");
    const bId = findNodeByLatex(tree, "b");

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [aId],
      mode: "multiplicative",
      hoverId: bId,
    });

    expect(result).toEqual([aId]);
  });

  it("does not promote a denominator factor to whole denominator product (issue 54)", () => {
    const tree = treefromLatex(String.raw`P = \frac{K}{v^{\gamma - 1} v}`);
    const vId = findNodeId(
      tree,
      (n) =>
        n.latex === "v" &&
        tree.parentById[n.id] != null &&
        tree.nodesById[tree.parentById[n.id]]?.op === "InvisibleOperator"
    );

    const result = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [vId],
      mode: "multiplicative",
      hoverId: tree.childrenById[tree.rootId!]?.[0] ?? null,
    });

    expect(result).toEqual([vId]);
  });

  it("normalizes drag handle through wrappers (Negate/Subscript/Vector)", () => {
    const tree = treefromLatex(String.raw`-\vec{a}_{1}`);
    const aId = findNodeByLatex(tree, "a");
    const negateId = findNodeId(tree, (n) => n.op === "Negate");
    const overVectorId = findNodeId(
      tree,
      (n) => n.op === "Vector" || n.op === "OverVector"
    );
    const subscriptId = findNodeId(tree, (n) => n.op === "Subscript");

    expect(normalizeDragHandleId(tree, aId)).toBe(negateId);
    expect(normalizeDragHandleId(tree, overVectorId)).toBe(negateId);
    expect(normalizeDragHandleId(tree, subscriptId)).toBe(negateId);
  });

  it("detects vector ancestry", () => {
    const tree = treefromLatex(String.raw`\vec{F} = m \vec{a}`);
    const vecAId = findNodeByLatex(tree, String.raw`\vec{a}`);

    expect(hasVectorAncestor(tree, vecAId)).toBe(true);
  });
});
