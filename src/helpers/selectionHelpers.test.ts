import { describe, expect, it } from "vitest";
import { findNodeId, treefromLatex } from "../testHelpers";
import { expandAtomicSelectionNodeIds } from "./selectionHelpers";

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
