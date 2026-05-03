import { describe, expect, it } from "vitest";
import { compileMathDocument } from "../math/compile/compileMathDocument";
import { applyCtrlClickIntent } from "./multiSelectionController";

function findNodeIdBySymbolName(latex: string, name: string): string {
  const compiled = compileMathDocument(latex);
  const hit = Object.entries(compiled.index.nodeById).find(
    ([_, expr]) => expr.kind === "symbol" && expr.name === name,
  );
  if (!hit) throw new Error(`Could not find symbol ${name}`);
  return hit[0];
}

describe("multi-selection add/product", () => {
  it("returns no matching rule when ctrl-click starts with no current selection", () => {
    const latex = "a + b";
    const doc = compileMathDocument(latex);
    const aId = findNodeIdBySymbolName(latex, "a");

    const result = applyCtrlClickIntent({
      nodeId: aId,
      currentSelection: null,
      index: doc.index,
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("no_matching_ctrl_click_rule");
    expect(result.nextSelection).toBeNull();
  });

  it("adds second term when one is already selected", () => {
    const latex = "a + b";
    const doc = compileMathDocument(latex);

    const aId = findNodeIdBySymbolName(latex, "a");
    const bId = findNodeIdBySymbolName(latex, "b");

    const result = applyCtrlClickIntent({
      nodeId: bId,
      currentSelection: { kind: "single", nodeId: aId },
      index: doc.index,
    });

    expect(result.accepted).toBe(true);
    expect(result.nextSelection).toEqual({
      kind: "multi",
      nodeIds: [aId, bId],
      containerNodeId: "n1",
    });
  });

  it("de-selects single selection when ctrl-clicking the same node", () => {
    const latex = "a + b";
    const doc = compileMathDocument(latex);
    const aId = findNodeIdBySymbolName(latex, "a");

    const result = applyCtrlClickIntent({
      nodeId: aId,
      currentSelection: { kind: "single", nodeId: aId },
      index: doc.index,
    });

    expect(result.accepted).toBe(true);
    expect(result.ruleId).toBe("de-select_single_node");
    expect(result.nextSelection).toBeNull();
  });

  it("rejects when single selection and ctrl-click are in different containers", () => {
    const latex = String.raw`a + b = c`;
    const doc = compileMathDocument(latex);
    const aId = findNodeIdBySymbolName(latex, "a");
    const cId = findNodeIdBySymbolName(latex, "c");

    const result = applyCtrlClickIntent({
      nodeId: cId,
      currentSelection: { kind: "single", nodeId: aId },
      index: doc.index,
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("no_matching_ctrl_click_rule");
    expect(result.nextSelection).toEqual({ kind: "single", nodeId: aId });
  });

  it("maps descendant ctrl-clicks to direct container terms in multi mode", () => {
    const latex = String.raw`\frac{a}{b} + c`;
    const doc = compileMathDocument(latex);
    const aId = findNodeIdBySymbolName(latex, "a");
    const cId = findNodeIdBySymbolName(latex, "c");
    const addId = Object.entries(doc.index.nodeById).find(
      ([_, expr]) => expr.kind === "add",
    )?.[0];
    const fractionId = Object.entries(doc.index.nodeById).find(
      ([_, expr]) => expr.kind === "divide",
    )?.[0];
    if (!addId || !fractionId) throw new Error("Expected add and divide nodes");

    const result = applyCtrlClickIntent({
      nodeId: aId,
      currentSelection: {
        kind: "multi",
        nodeIds: [fractionId, cId],
        containerNodeId: addId,
      },
      index: doc.index,
    });

    expect(result.accepted).toBe(true);
    expect(result.ruleId).toBe("convert_multi_to_single");
    expect(result.nextSelection).toEqual({ kind: "single", nodeId: cId });
  });
});
