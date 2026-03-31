import { describe, expect, it } from "vitest";
import { treefromLatex } from "../../testHelpers";
import {
  applyReplayResult,
  replayFinalMoveSample,
  replayMoveCapture,
} from "./moveDebugFixture";

function findIdByLatex(tree: ReturnType<typeof treefromLatex>, latex: string): string {
  const hit = Object.values(tree.nodesById).find((node) => node.latex === latex);
  if (!hit) {
    throw new Error(`Could not find node for latex '${latex}'.`);
  }
  return hit.id;
}

describe("moveDebugFixture replay", () => {
  it("replays additive reorder using captured rect snapshot", () => {
    const tree = treefromLatex("a + b");
    const aId = findIdByLatex(tree, "a");
    const bId = findIdByLatex(tree, "b");
    const addId = tree.parentById[aId] ?? "";
    expect(addId).toBeTruthy();

    const replay = replayMoveCapture({
      tree,
      mode: "additive",
      selectedIds: [bId],
      rects: {
        [addId]: { left: 0, top: 0, right: 100, bottom: 40 },
        [aId]: { left: 0, top: 0, right: 45, bottom: 40 },
        [bId]: { left: 55, top: 0, right: 100, bottom: 40 },
      },
      samples: [{ pointer: { x: 5, y: 20 }, hoverId: addId }],
    });

    expect(replay.finalPlan?.kind).toBe("ReorderAdd");
    expect(replay.finalTarget).toEqual({
      hoverId: addId,
      targetSlot: 0,
    });
    expect(replay.finalFrame?.index).toBe(0);
    expect(replay.finalFrame?.isFinalSample).toBe(true);
    expect(replay.finalFrame?.hoverNode?.latex).toBe("a + b");
    expect(replay.finalFrame?.selectedNodes[0]?.latex).toBe("b");
    expect(replay.finalFrame?.planNodes.some((n) => n.id === addId)).toBe(true);

    const next = applyReplayResult({
      tree,
      mode: "additive",
      selectedIds: [bId],
      replay,
    });
    expect(next?.latexPlain).toBe("b + a");
  });

  it("can replay only the final sample for easier breakpoints", () => {
    const tree = treefromLatex("a + b");
    const aId = findIdByLatex(tree, "a");
    const bId = findIdByLatex(tree, "b");
    const addId = tree.parentById[aId] ?? "";
    const replay = replayFinalMoveSample({
      tree,
      mode: "additive",
      selectedIds: [bId],
      rects: {
        [addId]: { left: 0, top: 0, right: 100, bottom: 40 },
        [aId]: { left: 0, top: 0, right: 45, bottom: 40 },
        [bId]: { left: 55, top: 0, right: 100, bottom: 40 },
      },
      samples: [
        { pointer: { x: 90, y: 20 }, hoverId: addId },
        { pointer: { x: 5, y: 20 }, hoverId: addId },
      ],
    });

    expect(replay.frames).toHaveLength(1);
    expect(replay.finalFrame?.index).toBe(1);
    expect(replay.finalTarget?.targetSlot).toBe(0);
  });
});

