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
});
