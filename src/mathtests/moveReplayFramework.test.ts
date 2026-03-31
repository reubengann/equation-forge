/// <reference types="node" />
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { mathPadFacade } from "../application";
import {
  applyReplayResult,
  replayFinalMoveSample,
  type MoveCaptureFixture,
} from "../domain/move/moveDebugFixture";

function normalizeLatex(value: string): string {
  return value.replace(/\\,/g, " ").replace(/\s+/g, " ").trim();
}

describe("move replay framework", () => {
  it("replays captured issue16e drag without browser", () => {
    const fixturePath = join(
      process.cwd(),
      "mathtests",
      "captured",
      "issue16e-e-onto-f.json"
    );
    const fixture = JSON.parse(
      readFileSync(fixturePath, "utf8")
    ) as MoveCaptureFixture;

    const parsed = mathPadFacade.parseLatex(fixture.expressionLatex);
    expect(parsed).toBeTruthy();
    const tree = mathPadFacade.createTree(parsed!);

    const replay = replayFinalMoveSample({
      tree,
      mode: fixture.mode,
      selectedIds: fixture.selectedIds,
      rects: fixture.rects,
      samples: fixture.samples,
    });

    // Breakpoint target: this frame is the final pointer sample only.
    expect(replay.finalFrame?.isFinalSample).toBe(true);
    expect(replay.finalFrame?.hoverNode?.latex).toBe("f");
    expect(replay.finalPlan?.kind).toBe("PullOutOfFraction");

    const next = applyReplayResult({
      tree,
      mode: fixture.mode,
      selectedIds: fixture.selectedIds,
      replay,
    });
    expect(next).toBeTruthy();
    expect(normalizeLatex(next!.latexPlain)).toBe(
      normalizeLatex("a = b + \\left[c + d\\right] \\frac{f}{e}")
    );
  });
});

