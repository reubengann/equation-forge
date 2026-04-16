import { describe, expect, it } from "vitest";
import { findNodeId, treefromLatex } from "../testHelpers";
import { expandAtomicSelectionNodeIds, getLatexForSelectionCopy } from "./selectionHelpers";

describe("expandAtomicSelectionNodeIds", () => {
  it("keeps DeltaOfQuantity as a single atomic node", () => {
    const tree = treefromLatex(String.raw`a = \frac{\left(b+c\right)}{d} \Delta t`);
    const deltaTId = findNodeId(
      tree,
      (n) => n.op === "DeltaOfQuantity" && n.latex === String.raw`\Delta t`
    );

    const expanded = expandAtomicSelectionNodeIds(tree, [deltaTId]);
    expect(expanded).toEqual([deltaTId]);
  });

  it("does not expand ordinary symbols", () => {
    const tree = treefromLatex(String.raw`a = x y`);
    const xId = findNodeId(tree, (n) => n.op === "Symbol" && n.latex === "x");
    const expanded = expandAtomicSelectionNodeIds(tree, [xId]);
    expect(expanded).toEqual([xId]);
  });
});

describe("getLatexForSelectionCopy", () => {
  it("returns grouped latex for contiguous multi-selection", () => {
    const tree = treefromLatex(String.raw`a = b c e + \left[g h + i\right] f`);
    const bId = findNodeId(tree, (n) => n.latex === "b");
    const cId = findNodeId(tree, (n) => n.latex === "c");
    const latex = getLatexForSelectionCopy(tree, {
      kind: "multi",
      nodeIds: [bId, cId],
    });
    expect(latex).toBe(String.raw`b c`);
  });

  it("returns span expression latex", () => {
    const tree = treefromLatex(String.raw`a = b + c + d`);
    const addId = tree.childrenById[tree.rootId]?.[1];
    expect(addId).toBeTruthy();
    const latex = getLatexForSelectionCopy(tree, {
      kind: "span",
      parentId: addId!,
      op: "Add",
      start: 1,
      end: 2,
    });
    expect(latex).toBe(String.raw`c + d`);
  });

  it("returns additive grouped latex for descendant multi-selection under same Add", () => {
    const tree = treefromLatex(
      String.raw`c_{v}\mathrm{d}{T} + \frac{a}{v^{2}}\mathrm{d}{v} + P\mathrm{d}{v} = 0`
    );
    const dvFromFraction = findNodeId(
      tree,
      (n) =>
        n.latex === String.raw`\mathrm{d}{v}` &&
        tree.nodesById[tree.parentById[n.id] ?? ""]?.op === "InvisibleOperator"
    );
    const pId = findNodeId(tree, (n) => n.latex === "P");
    const latex = getLatexForSelectionCopy(tree, {
      kind: "multi",
      nodeIds: [dvFromFraction, pId],
    });
    expect(latex).toBe(String.raw`\frac{a}{v^{2}} \mathrm{d}{v} + P \mathrm{d}{v}`);
  });

  it("preserves additive delimiter term when mixed descendants are selected (issue 104)", () => {
    const tree = treefromLatex(
      String.raw`\mathrm{d}{s} = \frac{1}{T} \left(\frac{\partial{u}}{\partial{T}}\right)_{v} \mathrm{d}{T} + \frac{1}{T} \left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right] \mathrm{d}{v}`
    );
    const oneOverTId = findNodeId(
      tree,
      (n) =>
        n.op === "Divide" &&
        n.latex === String.raw`\frac{1}{T}` &&
        (() => {
          const rhsId = tree.childrenById[tree.rootId]?.[1];
          const rhsKids = rhsId ? tree.childrenById[rhsId] ?? [] : [];
          const secondTermId = rhsKids[1];
          return secondTermId != null && tree.parentById[n.id] === secondTermId;
        })()
    );
    const duDvSubscriptId = findNodeId(
      tree,
      (n) =>
        n.op === "Subscript" &&
        n.latex.includes(String.raw`\frac{\partial{u}}{\partial{v}}`) &&
        n.latex.endsWith(String.raw`_{T}`)
    );
    const pId = findNodeId(tree, (n) => n.op === "Symbol" && n.latex === "P");

    const latex = getLatexForSelectionCopy(tree, {
      kind: "multi",
      nodeIds: [oneOverTId, duDvSubscriptId, pId],
    });
    expect(latex).toBe(
      String.raw`\left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right]`
    );
  });
});
