import { describe, expect, it } from "vitest";
import { compileMathDocument } from "../math/compile/compileMathDocument";
import {
  buildNodeResolutionSource,
  createSelectionControllerState,
  resolveSelectionFromEvent,
  selectionNodeIds,
  type NodeRect,
  type SelectionControllerEvent,
  type SelectionControllerState,
} from "./selectionController";

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
  return resolveSelectionFromEvent({
    event,
    currentSelection: state.selection,
    nodeResolutionSource: buildNodeResolutionSource(nodeRects, compiled.index),
    index: compiled.index,
    state,
  });
}

describe("selectionController", () => {
  it("selects a single node on pointer_down", () => {
    const result = runEvent(
      createSelectionControllerState(),
      {
        type: "pointer_down",
        pointer: { x: 10, y: 10 },
        ts: 1,
        buttons: 1,
        ctrlKey: false,
      },
      makeRect([
        ["n1", 0, 100],
        ["n2", 0, 45],
        ["n3", 55, 100],
      ]),
      String.raw`a+b`,
    );
    expect(result.selection).toEqual({ kind: "single", nodeId: "n2" });
  });

  it("expands single selection into multi on ctrl-click", () => {
    const rects = makeRect([
      ["n1", 0, 100],
      ["n2", 0, 45],
      ["n3", 55, 100],
    ]);
    const first = runEvent(
      createSelectionControllerState(),
      {
        type: "pointer_down",
        pointer: { x: 10, y: 10 },
        ts: 1,
        buttons: 1,
        ctrlKey: false,
      },
      rects,
      String.raw`a+b`,
    );
    const second = runEvent(
      first,
      {
        type: "pointer_down",
        pointer: { x: 60, y: 10 },
        ts: 2,
        buttons: 1,
        ctrlKey: true,
      },
      rects,
      String.raw`a+b`,
    );
    expect(second.selection).toEqual({
      kind: "multi",
      nodeIds: ["n2", "n3"],
      containerNodeId: "n1",
    });
  });

  it("returns all selected node ids for single, multi, and empty", () => {
    expect(selectionNodeIds({ kind: "single", nodeId: "n2" })).toEqual(["n2"]);
    expect(
      selectionNodeIds({
        kind: "multi",
        nodeIds: ["n4", "n7"],
        containerNodeId: "n1",
      }),
    ).toEqual(["n4", "n7"]);
    expect(selectionNodeIds(null)).toEqual([]);
  });
});
