import { describe, expect, it } from "vitest";
import { applyMove } from "./applyMove";
import { findNodeId, treefromLatex } from "../testHelpers";

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

  it("keeps additive numerator grouped when pulling denominator out (issue 143)", () => {
    const tree = treefromLatex(
      String.raw`\mathrm{d}{S} = \frac{\mathrm{d}{U} + Y_{1} \, \mathrm{d}{X_{1}} + Y_{2} \, \mathrm{d}{X_{2}}}{T}`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    if (!rhsId) return;

    const tId = findNodeId(
      tree,
      (n) =>
        n.latex === "T" &&
        (() => {
          const parentId = tree.parentById[n.id];
          if (!parentId) return false;
          return tree.nodesById[parentId]?.op === "Divide";
        })()
    );
    expect(tId).toBeTruthy();
    if (!tId) return;

    const next = applyMove({
      tree,
      selectedIds: [tId],
      hoverId: rhsId,
      targetSlot: 0,
      mode: "multiplicative",
    });

    expect(next).not.toBeNull();
    if (!next) return;
    expect(next.latexPlain).toBe(
      String.raw`\mathrm{d}{S} = \frac{1}{T} \left(\mathrm{d}{U} + Y_{1} \mathrm{d}{X_{1}} + Y_{2} \mathrm{d}{X_{2}}\right)`
    );

    const rhs = next.childrenById[next.rootId]?.[1];
    expect(rhs).toBeTruthy();
    if (!rhs) return;
    expect(next.nodesById[rhs]?.op).toBe("InvisibleOperator");
    const rhsKids = next.childrenById[rhs] ?? [];
    expect(next.nodesById[rhsKids[1]]?.op).toBe("Delimiter");
  });
});

