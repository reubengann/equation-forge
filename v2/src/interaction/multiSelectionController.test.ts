import { describe, expect, it } from "vitest";
import { compileMathDocument } from "../math/compile/compileMathDocument";
import { applyCtrlClickIntent, applyMarqueeSelectIntent } from "./multiSelectionController";

function findNodeIdBySymbolName(latex: string, name: string): string {
  const compiled = compileMathDocument(latex);
  const hit = Object.entries(compiled.index.nodeById).find(
    ([_, expr]) => expr.kind === "symbol" && expr.name === name,
  );
  if (!hit) throw new Error(`Could not find symbol ${name}`);
  return hit[0];
}

function findAllNodeIdsBySymbolName(latex: string, name: string): string[] {
  const compiled = compileMathDocument(latex);
  return Object.entries(compiled.index.nodeById)
    .filter(([_, expr]) => expr.kind === "symbol" && expr.name === name)
    .map(([nodeId]) => nodeId);
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

  it("selects a single marquee term as a single selection", () => {
    const latex = "a + b + c";
    const doc = compileMathDocument(latex);
    const bId = findNodeIdBySymbolName(latex, "b");

    const result = applyMarqueeSelectIntent({
      nodeIds: [bId],
      currentSelection: null,
      index: doc.index,
    });

    expect(result.accepted).toBe(true);
    expect(result.nextSelection).toEqual({ kind: "single", nodeId: bId });
  });

  it("selects a standalone marquee term as a single selection", () => {
    const latex = "x";
    const doc = compileMathDocument(latex);
    const xId = findNodeIdBySymbolName(latex, "x");

    const result = applyMarqueeSelectIntent({
      nodeIds: [xId],
      currentSelection: null,
      index: doc.index,
    });

    expect(result.accepted).toBe(true);
    expect(result.nextSelection).toEqual({ kind: "single", nodeId: xId });
  });

  it("selects marquee terms under the same sum container", () => {
    const latex = "a + b + c";
    const doc = compileMathDocument(latex);
    const bId = findNodeIdBySymbolName(latex, "b");
    const cId = findNodeIdBySymbolName(latex, "c");

    const result = applyMarqueeSelectIntent({
      nodeIds: [cId, bId],
      currentSelection: null,
      index: doc.index,
    });

    expect(result.accepted).toBe(true);
    expect(result.nextSelection).toEqual({
      kind: "multi",
      nodeIds: [bId, cId],
      containerNodeId: "n1",
    });
  });

  it("maps marquee descendants to direct container terms", () => {
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

    const result = applyMarqueeSelectIntent({
      nodeIds: [aId, cId],
      currentSelection: null,
      index: doc.index,
    });

    expect(result.accepted).toBe(true);
    expect(result.nextSelection).toEqual({
      kind: "multi",
      nodeIds: [fractionId, cId],
      containerNodeId: addId,
    });
  });

  it("forgives partial marquee hits inside adjacent additive terms", () => {
    const latex = String.raw`2a+2b+2ab+a^2+b^2`;
    const doc = compileMathDocument(latex);
    const aId = findNodeIdBySymbolName(latex, "a");
    const secondTermId = Object.entries(doc.index.nodeById).find(
      ([nodeId, expr]) =>
        expr.kind === "multiply" &&
        doc.index.locationById[nodeId]?.parentId === "n1" &&
        doc.index.locationById[nodeId]?.index === 1,
    )?.[0];
    if (!secondTermId) throw new Error("Expected second additive term");

    const twoInSecondTermId = (doc.index.childrenById[secondTermId] ?? []).find(
      (nodeId) => doc.index.nodeById[nodeId]?.kind === "number",
    );
    if (!twoInSecondTermId) throw new Error("Expected coefficient in second term");

    const result = applyMarqueeSelectIntent({
      nodeIds: [aId, twoInSecondTermId],
      currentSelection: null,
      index: doc.index,
    });

    expect(result.accepted).toBe(true);
    expect(result.nextSelection).toEqual({
      kind: "multi",
      nodeIds: ["n2", secondTermId],
      containerNodeId: "n1",
    });
  });

  it("selects full additive terms instead of nested product factors", () => {
    const latex = String.raw`s=c_P\ln\left(\frac{T}{T_0}\right)-R\ln\left(\frac{T}{T_0}\right)+R\ln v_0-R\ln v+s_0`;
    const doc = compileMathDocument(latex);
    const firstProductId = "n4";
    const negatedProductId = "n11";

    const result = applyMarqueeSelectIntent({
      nodeIds: ["n4", "n5", "n6", "n11", "n12", "n13", "n14"],
      currentSelection: null,
      index: doc.index,
    });

    expect(result.accepted).toBe(true);
    expect(result.nextSelection).toEqual({
      kind: "multi",
      nodeIds: [firstProductId, negatedProductId],
      containerNodeId: "n3",
    });
  });

  it("ignores a stray overlapping term when a coherent nested sum was marquee selected", () => {
    const latex = String.raw`(a+b)(c+e)`;
    const doc = compileMathDocument(latex);
    const bId = findNodeIdBySymbolName(latex, "b");
    const cId = findNodeIdBySymbolName(latex, "c");
    const eId = findNodeIdBySymbolName(latex, "e");
    const rightSumId = doc.index.parentById[cId];
    if (!rightSumId) throw new Error("Expected parent sum");

    const result = applyMarqueeSelectIntent({
      nodeIds: [bId, cId, eId],
      currentSelection: null,
      index: doc.index,
    });

    expect(result.accepted).toBe(true);
    expect(result.nextSelection).toEqual({
      kind: "multi",
      nodeIds: [cId, eId],
      containerNodeId: rightSumId,
    });
  });

  it("rejects marquee selections that mix sum and product containers", () => {
    const latex = String.raw`(a+b)c`;
    const doc = compileMathDocument(latex);
    const bId = findNodeIdBySymbolName(latex, "b");
    const cId = findAllNodeIdsBySymbolName(latex, "c")[0];
    const currentSelection = { kind: "single", nodeId: bId } as const;

    const result = applyMarqueeSelectIntent({
      nodeIds: [bId, cId],
      currentSelection,
      index: doc.index,
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("mixed_marquee_containers");
    expect(result.nextSelection).toEqual(currentSelection);
  });
});
