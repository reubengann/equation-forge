import { describe, expect, it } from "vitest";
import {
  buildNodeResolutionSource,
  createSelectionControllerState,
  resolveSelectionFromEvent,
  type NodeRect,
  type SelectionControllerEvent,
  type SelectionControllerState,
} from "./selectionController";
import { compileMathDocument } from "../math/compile/compileMathDocument";

function makeRect(
  specs: Array<[nodeId: string, left: number, right: number]>,
): NodeRect[] {
  return specs.map(([nodeId, left, right]) => ({
    nodeId,
    left,
    top: 0,
    right,
    bottom: 20,
    width: right - left,
    height: 20,
  }));
}

function runEvent(
  state: SelectionControllerState,
  event: SelectionControllerEvent,
  nodeRects: NodeRect[],
  latex: string,
) {
  const compiled = compileMathDocument(latex);
  const result = resolveSelectionFromEvent({
    event,
    nodeResolution: buildNodeResolutionSource(nodeRects, compiled.index),
    index: compiled.index,
    state,
  });
  return { result, compiled };
}

function idForKind(
  latex: string,
  kind: string,
  extraPredicate?: (entry: [string, unknown]) => boolean,
): string {
  const compiled = compileMathDocument(latex);
  const hit = Object.entries(compiled.index.nodeById).find(([_, expr]) => {
    if (
      typeof expr === "object" &&
      expr !== null &&
      "kind" in expr &&
      (expr as { kind: string }).kind === kind
    ) {
      if (!extraPredicate) return true;
      return extraPredicate([_, expr]);
    }
    return false;
  });
  if (!hit) throw new Error(`Could not find node kind ${kind}`);
  return hit[0];
}

describe("selectionController click handling", () => {
  it("selects on pointer_down and preserves that selection on pointer_up", () => {
    const latex = String.raw`a+b`;
    const state0 = createSelectionControllerState();
    const rects = makeRect([
      ["n1", 0, 100],
      ["n2", 0, 45],
      ["n3", 55, 100],
    ]);

    const down = runEvent(
      state0,
      {
        type: "pointer_down",
        pointer: { x: 10, y: 10 },
        ts: 1,
        buttons: 1,
        ctrlKey: false,
      },
      rects,
      latex,
    );
    expect(down.result.selectedNodeId).toBe("n2");

    const up = runEvent(
      down.result,
      {
        type: "pointer_up",
        pointer: { x: 10, y: 10 },
        ts: 2,
        buttons: 1,
        ctrlKey: false,
      },
      rects,
      latex,
    );
    expect(up.result.selectedNodeId).toBe("n2");
  });

  it("suppresses pointer_up re-selection when movement indicates drag", () => {
    const latex = String.raw`a+b`;
    const state0 = createSelectionControllerState();
    const rects = makeRect([
      ["n1", 0, 100],
      ["n2", 0, 45],
      ["n3", 55, 100],
    ]);

    const down = runEvent(
      state0,
      {
        type: "pointer_down",
        pointer: { x: 10, y: 10 },
        ts: 1,
        buttons: 1,
        ctrlKey: false,
      },
      rects,
      latex,
    );
    const up = runEvent(
      down.result,
      {
        type: "pointer_up",
        pointer: { x: 40, y: 10 },
        ts: 2,
        buttons: 1,
        ctrlKey: false,
      },
      rects,
      latex,
    );
    expect(up.result.selectedNodeId).toBe("n2");
  });

  it("does not change selection on pointer_down when something is already selected", () => {
    const latex = String.raw`a+b`;
    const state0 = {
      ...createSelectionControllerState(),
      selectedNodeId: "n2",
    };
    const rects = makeRect([
      ["n1", 0, 100],
      ["n2", 0, 45],
      ["n3", 55, 100],
    ]);

    const down = runEvent(
      state0,
      {
        type: "pointer_down",
        pointer: { x: 60, y: 10 },
        ts: 1,
        buttons: 1,
        ctrlKey: false,
      },
      rects,
      latex,
    );
    expect(down.result.selectedNodeId).toBe("n2");
  });

  it("throws if a rect references an unknown node id", () => {
    const latex = String.raw`a+b`;
    const rects = makeRect([
      ["n1", 0, 100],
      ["n999", 0, 45],
    ]);

    expect(() =>
      runEvent(
        createSelectionControllerState(),
        {
          type: "pointer_down",
          pointer: { x: 10, y: 10 },
          ts: 1,
          buttons: 1,
          ctrlKey: false,
        },
        rects,
        latex,
      ),
    ).toThrow(/unknown rect nodeId/i);
  });

  it("double click moves to nearest selectable ancestor", () => {
    const latex = String.raw`a+b`;
    const rects = makeRect([
      ["n1", 0, 100],
      ["n2", 0, 45],
      ["n3", 55, 100],
    ]);
    let state = createSelectionControllerState();
    let selected: string | null = null;

    const firstDown = runEvent(
      state,
      {
        type: "pointer_down",
        pointer: { x: 10, y: 10 },
        ts: 10,
        buttons: 1,
        ctrlKey: false,
      },
      rects,
      latex,
    );
    state = firstDown.result;
    selected = firstDown.result.selectedNodeId;

    const firstUp = runEvent(
      state,
      {
        type: "pointer_up",
        pointer: { x: 10, y: 10 },
        ts: 20,
        buttons: 1,
        ctrlKey: false,
      },
      rects,
      latex,
    );
    state = firstUp.result;
    selected = firstUp.result.selectedNodeId;
    expect(selected).toBe("n2");

    const secondDown = runEvent(
      state,
      {
        type: "pointer_down",
        pointer: { x: 10, y: 10 },
        ts: 100,
        buttons: 1,
        ctrlKey: false,
      },
      rects,
      latex,
    );
    state = secondDown.result;
    selected = secondDown.result.selectedNodeId;

    const secondUp = runEvent(
      state,
      {
        type: "pointer_up",
        pointer: { x: 10, y: 10 },
        ts: 120,
        buttons: 1,
        ctrlKey: false,
      },
      rects,
      latex,
    );
    expect(secondUp.result.selectedNodeId).toBeNull();
  });

  it("rejects selecting add/equation operators directly", () => {
    const addLatex = String.raw`a+b`;
    const addRects = makeRect([
      ["n1", 0, 100],
      ["n2", 0, 40],
      ["n3", 60, 100],
    ]);
    const addClick = runEvent(
      createSelectionControllerState(),
      {
        type: "pointer_down",
        pointer: { x: 50, y: 10 },
        ts: 1,
        buttons: 1,
        ctrlKey: false,
      },
      addRects,
      addLatex,
    );
    expect(addClick.result.selectedNodeId).toBeNull();

    const equationLatex = String.raw`a=b`;
    const equationRects = makeRect([
      ["n1", 0, 100],
      ["n2", 0, 40],
      ["n3", 60, 100],
    ]);
    const equationClick = runEvent(
      createSelectionControllerState(),
      {
        type: "pointer_down",
        pointer: { x: 50, y: 10 },
        ts: 1,
        buttons: 1,
        ctrlKey: false,
      },
      equationRects,
      equationLatex,
    );
    expect(equationClick.result.selectedNodeId).toBeNull();
  });

  it("escalates child hits to primed and partial-derivative wrapper nodes", () => {
    const primedLatex = String.raw`x'`;
    const primedId = idForKind(primedLatex, "primed");
    const primedChildId = idForKind(
      primedLatex,
      "symbol",
      ([_, expr]) => (expr as { name?: string }).name === "x",
    );
    const primedRects: NodeRect[] = [
      {
        nodeId: primedId,
        left: 0,
        top: 0,
        right: 60,
        bottom: 20,
        width: 60,
        height: 20,
      },
      {
        nodeId: primedChildId,
        left: 0,
        top: 0,
        right: 30,
        bottom: 20,
        width: 30,
        height: 20,
      },
    ];

    const primedDown = runEvent(
      createSelectionControllerState(),
      {
        type: "pointer_down",
        pointer: { x: 10, y: 10 },
        ts: 1,
        buttons: 1,
        ctrlKey: false,
      },
      primedRects,
      primedLatex,
    );
    const primedUp = runEvent(
      primedDown.result,
      {
        type: "pointer_up",
        pointer: { x: 10, y: 10 },
        ts: 2,
        buttons: 1,
        ctrlKey: false,
      },
      primedRects,
      primedLatex,
    );
    expect(primedUp.result.selectedNodeId).toBe(primedId);

    const partialLatex = String.raw`\frac{\partial{s}}{\partial{T}}`;
    const partialId = idForKind(partialLatex, "partial_derivative");
    const partialQuantityId = idForKind(
      partialLatex,
      "symbol",
      ([_, expr]) => (expr as { name?: string }).name === "s",
    );
    const partialRects: NodeRect[] = [
      {
        nodeId: partialId,
        left: 0,
        top: 0,
        right: 100,
        bottom: 40,
        width: 100,
        height: 40,
      },
      {
        nodeId: partialQuantityId,
        left: 10,
        top: 5,
        right: 35,
        bottom: 20,
        width: 25,
        height: 15,
      },
    ];

    const partialDown = runEvent(
      createSelectionControllerState(),
      {
        type: "pointer_down",
        pointer: { x: 15, y: 10 },
        ts: 10,
        buttons: 1,
        ctrlKey: false,
      },
      partialRects,
      partialLatex,
    );
    const partialUp = runEvent(
      partialDown.result,
      {
        type: "pointer_up",
        pointer: { x: 15, y: 10 },
        ts: 20,
        buttons: 1,
        ctrlKey: false,
      },
      partialRects,
      partialLatex,
    );
    expect(partialUp.result.selectedNodeId).toBe(partialId);
  });
});
