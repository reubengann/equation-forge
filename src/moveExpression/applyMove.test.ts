import { describe, expect, it } from "vitest";
import { applyMove } from "./applyMove";
import { treefromLatex } from "../testHelpers";

describe("applyMove round-trip invariant", () => {
  it("allows additive cross-equal move for derivative+gamma expression (issue 43)", () => {
    const tree = treefromLatex(
      String.raw`\frac{\mathrm{d}{P_{s}}}{\mathrm{d}{v_{s}}} = -\gamma \frac{P}{v}`
    );

    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    const lhsRootId = tree.childrenById[tree.rootId]?.[0];
    expect(lhsRootId).toBeTruthy();

    const next = applyMove({
      tree,
      selectedIds: [rhsId!],
      hoverId: lhsRootId!,
      targetSlot: 1,
      mode: "additive",
    });

    expect(next).not.toBeNull();
    expect(next!.latexPlain).toContain("= 0");
  });
});

