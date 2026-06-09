import { describe, expect, it } from "vitest";
import { compileMathDocument } from "../math/compile/compileMathDocument";
import {
  buildNodeResolutionSource,
  createSelectionControllerState,
  rectFromPoints,
  resolveMarqueeNodeIds,
  resolveNodeAtPoint,
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

function findNodeIdByKind(
  latex: string,
  kind: string,
  predicate?: (node: unknown) => boolean,
): string {
  const compiled = compileMathDocument(latex);
  const hit = Object.entries(compiled.index.nodeById).find(([_, node]) => {
    if (typeof node !== "object" || node === null || !("kind" in node)) return false;
    if ((node as { kind: string }).kind !== kind) return false;
    return predicate ? predicate(node) : true;
  });
  if (!hit) throw new Error(`Could not find node of kind ${kind}`);
  return hit[0];
}

describe("selectionController", () => {
  it("explains stale geometry when rect node ids are not in the compiled expression", () => {
    const compiled = compileMathDocument(String.raw`a+b`);

    expect(() =>
      buildNodeResolutionSource(
        makeRect([
          ["n1", 0, 100],
          ["n99", 20, 40],
        ]),
        compiled.index,
      ),
    ).toThrow(
      /Selection geometry includes node id n99, but the compiled expression does not contain it.*DOM snapshot\/rect cache is stale.*Unknown rect ids: n99.*Compiled ids: n1, n2, n3.*Rect ids: n1, n99/s,
    );
  });

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

  it("resolves the nearest same-row node when MathLive leaves a rendered gap past a long expression", () => {
    const compiled = compileMathDocument(String.raw`a+b`);
    const nodeResolution = buildNodeResolutionSource(
      makeRect([
        ["n1", 0, 100],
        ["n2", 0, 45],
        ["n3", 55, 100],
      ]),
      compiled.index,
    );

    expect(resolveNodeAtPoint({ x: 130, y: 10 }, nodeResolution, compiled.index)).toEqual({
      treeHitNodeId: "n3",
      selectableNodeId: "n3",
    });
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

  it("marquee descends through display groups around sums", () => {
    const latex = String.raw`(a+b)(c+e)`;
    const compiled = compileMathDocument(latex);
    const rects = makeRect([
      ["n1", 0, 130],
      ["n6", 65, 130],
      ["n7", 70, 120],
      ["n8", 70, 85],
      ["n9", 105, 120],
    ]);

    expect(
      resolveMarqueeNodeIds(
        rectFromPoints({ x: 60, y: 0 }, { x: 130, y: 20 }),
        buildNodeResolutionSource(rects, compiled.index),
        compiled.index,
      ),
    ).toEqual(["n8", "n9"]);
  });

  it("marquee descends into delimited sum factors inside products", () => {
    const latex = String.raw`c_P\left(\ln P-\ln P_0+\ln v-\ln v_0\right)`;
    const compiled = compileMathDocument(latex);
    const rects = makeRect([
      ["n1", 0, 300],
      ["n2", 0, 30],
      ["n3", 30, 300],
      ["n4", 40, 290],
      ["n5", 40, 80],
      ["n8", 100, 150],
      ["n12", 170, 210],
    ]);

    expect(
      resolveMarqueeNodeIds(
        rectFromPoints({ x: 90, y: 0 }, { x: 155, y: 20 }),
        buildNodeResolutionSource(rects, compiled.index),
        compiled.index,
      ),
    ).toEqual(["n8"]);
  });

  it("keeps fully covered additive product terms whole before descending into their display groups", () => {
    const latex = String.raw`a+\left(b+c\right)\left(d+e\right)+f`;
    const compiled = compileMathDocument(latex);
    const rects = makeRect([
      ["n1", 0, 300],
      ["n2", 0, 30],
      ["n3", 40, 200],
      ["n4", 40, 120],
      ["n5", 45, 115],
      ["n6", 45, 60],
      ["n7", 95, 115],
      ["n12", 220, 250],
    ]);

    expect(
      resolveMarqueeNodeIds(
        rectFromPoints({ x: 35, y: 0 }, { x: 260, y: 20 }),
        buildNodeResolutionSource(rects, compiled.index),
        compiled.index,
      ),
    ).toEqual(["n3", "n12"]);
  });

  it("clicking non-selectable equals does not clear existing selection", () => {
    const latex = String.raw`a=b`;
    const rects = makeRect([
      ["n1", 0, 100],
      ["n2", 0, 40],
      ["n3", 60, 100],
    ]);
    const selectedLeft = runEvent(
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
    );

    const clickEqualsUp = runEvent(
      selectedLeft,
      {
        type: "pointer_up",
        pointer: { x: 50, y: 10 },
        ts: 2,
        buttons: 0,
        ctrlKey: false,
      },
      rects,
      latex,
    );

    expect(clickEqualsUp.selection).toEqual({ kind: "single", nodeId: "n2" });
  });

  it("double-click promotes single selection to next selectable parent", () => {
    const latex = String.raw`\frac{a}{b}`;
    const divideId = findNodeIdByKind(latex, "divide");
    const aId = findNodeIdByKind(
      latex,
      "symbol",
      (node) => (node as { name?: string }).name === "a",
    );
    const rects: NodeRect[] = [
      { nodeId: divideId, left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 },
      { nodeId: aId, left: 10, top: 5, right: 30, bottom: 20, width: 20, height: 15 },
    ];

    const state = {
      ...createSelectionControllerState(),
      selection: { kind: "single", nodeId: aId } as const,
      lastCommittedClick: { pointer: { x: 15, y: 10 }, ts: 100 },
    };
    const result = runEvent(
      state,
      {
        type: "pointer_down",
        pointer: { x: 15, y: 10 },
        ts: 120,
        buttons: 1,
        ctrlKey: false,
      },
      rects,
      latex,
    );

    expect(result.selection).toEqual({ kind: "single", nodeId: divideId });
  });

  it("records lastCommittedClick timestamp on selectable pointer_up", () => {
    const latex = String.raw`a+b`;
    const rects = makeRect([
      ["n1", 0, 100],
      ["n2", 0, 45],
      ["n3", 55, 100],
    ]);
    const selected = runEvent(
      createSelectionControllerState(),
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

    const committed = runEvent(
      selected,
      {
        type: "pointer_up",
        pointer: { x: 10, y: 10 },
        ts: 20,
        buttons: 0,
        ctrlKey: false,
      },
      rects,
      latex,
    );

    expect(committed.lastCommittedClick).toEqual({
      pointer: { x: 10, y: 10 },
      ts: 20,
    });
  });

  it("does not select the node under pointer_up after a suppressed drag release", () => {
    const latex = String.raw`a+b=c`;
    const rects = makeRect([
      ["n1", 0, 130],
      ["n2", 0, 80],
      ["n3", 0, 35],
      ["n4", 45, 80],
      ["n5", 100, 130],
    ]);
    const selected = runEvent(
      createSelectionControllerState(),
      {
        type: "pointer_down",
        pointer: { x: 50, y: 10 },
        ts: 10,
        buttons: 1,
        ctrlKey: false,
      },
      rects,
      latex,
    );

    const releasedOverOtherNode = runEvent(
      selected,
      {
        type: "pointer_up",
        pointer: { x: 110, y: 10 },
        ts: 20,
        buttons: 0,
        ctrlKey: false,
        suppressClickSelectionWhenDragging: true,
      },
      rects,
      latex,
    );

    expect(releasedOverOtherNode.selection).toEqual({ kind: "single", nodeId: "n4" });
    expect(releasedOverOtherNode.lastCommittedClick).toBeNull();
  });

  it("double-click on term in a+b promotes selection to add node", () => {
    const latex = String.raw`a+b`;
    const rects = makeRect([
      ["n1", 0, 100],
      ["n2", 0, 45],
      ["n3", 55, 100],
    ]);
    const state = {
      ...createSelectionControllerState(),
      selection: { kind: "single", nodeId: "n3" } as const,
      lastCommittedClick: { pointer: { x: 60, y: 10 }, ts: 100 },
    };

    const downResult = runEvent(
      state,
      {
        type: "pointer_down",
        pointer: { x: 60, y: 10 },
        ts: 120,
        buttons: 1,
        ctrlKey: false,
      },
      rects,
      latex,
    );

    expect(downResult.selection).toEqual({ kind: "single", nodeId: "n1" });

    const upResult = runEvent(
      downResult,
      {
        type: "pointer_up",
        pointer: { x: 60, y: 10 },
        ts: 130,
        buttons: 0,
        ctrlKey: false,
      },
      rects,
      latex,
    );

    expect(upResult.selection).toEqual({ kind: "single", nodeId: "n1" });
  });

  it("marquee selection uses overlapping rectangles", () => {
    const compiled = compileMathDocument(String.raw`a+b+c`);
    const rects = makeRect([
      ["n1", 0, 150],
      ["n2", 0, 40],
      ["n3", 55, 95],
      ["n4", 110, 150],
    ]);

    const nodeIds = resolveMarqueeNodeIds(
      { left: 90, top: 0, right: 112, bottom: 20, width: 22, height: 20 },
      buildNodeResolutionSource(rects, compiled.index),
      compiled.index,
    );

    expect(nodeIds).toEqual(["n3", "n4"]);
  });

  it("commits marquee selection on a marquee_select event", () => {
    const result = runEvent(
      createSelectionControllerState(),
      {
        type: "marquee_select",
        marqueeRect: rectFromPoints({ x: 50, y: 0 }, { x: 130, y: 20 }),
      },
      makeRect([
        ["n1", 0, 150],
        ["n2", 0, 40],
        ["n3", 55, 95],
        ["n4", 110, 150],
      ]),
      String.raw`a+b+c`,
    );

    expect(result.selection).toEqual({
      kind: "multi",
      nodeIds: ["n3", "n4"],
      containerNodeId: "n1",
    });
  });
});
