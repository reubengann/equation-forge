import { describe, expect, it } from "vitest";
import { applyMove } from "./applyMove";
import { applyMoveMultiplicative } from "./applyMoveMultiplicative";
import { ExpressionTree } from "../ExpressionTree";
import { planToApplyMoveTarget } from "../domain/move/movePlanAdapters";
import { normalizeSelectedIdsForMove } from "../domain/move/moveSelectionPolicy";
import { findNodeByLatex, treefromLatex } from "../testHelpers";

function normalizeLatex(latex: string): string {
  return latex.replace(/\s+/g, " ").trim();
}

describe("multiplicative move with dot products", () => {
  it("moves a scalar factor left of a basis vector across '='", () => {
    const tree = treefromLatex(
      String.raw`\vec{e}_{x} \cdot \vec{F}_{g} = \vec{e}_{x} \cdot m \ddot{\vec{r}}`
    );

    const mId = findNodeByLatex(tree, "m");
    const lhsRootId = tree.childrenById[tree.rootId!]?.[0];
    if (!lhsRootId) throw new Error("Missing LHS root");

    const next = applyMove({
      tree,
      selectedIds: [mId],
      hoverId: lhsRootId,
      targetSlot: 0,
      mode: "multiplicative",
    });

    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(
      normalizeLatex(
        String.raw`\frac{1}{m} \vec{e}_{x} \cdot \vec{F}_{g} = \vec{e}_{x} \cdot \ddot{\vec{r}}`
      )
    );
  });

  it("handles the mathjson shape seen in the UI debug snapshot", () => {
    const tree = ExpressionTree.create([
      "Equal",
      ["DotProduct", ["Subscript", ["Vector", "e"], "x"], ["Subscript", ["Vector", "F"], "g"]],
      [
        "DotProduct",
        ["Subscript", ["Vector", "e"], "x"],
        ["InvisibleOperator", "m", ["OverDot", ["Vector", "r"], 2]],
      ],
    ] as any);

    const lhsRootId = tree.childrenById[tree.rootId!]?.[0];
    const rhsRootId = tree.childrenById[tree.rootId!]?.[1];
    const rhsFactors = rhsRootId ? tree.childrenById[rhsRootId] ?? [] : [];
    const mId =
      rhsFactors[1] && tree.nodesById[rhsFactors[1]]?.latex === "m"
        ? rhsFactors[1]
        : findNodeByLatex(tree, "m");

    const next = applyMoveMultiplicative({
      tree,
      selectedIds: [mId],
      hoverId: lhsRootId!,
      targetSlot: 0,
      mode: "multiplicative",
    });

    expect(next).not.toBeNull();
    const latex = normalizeLatex(next!.latexPlain);
    expect(
      latex ===
        normalizeLatex(
          String.raw`\frac{1}{m} \vec{e}_{x} \cdot \vec{F}_{g} = \vec{e}_{x} \cdot \ddot{\vec{r}}`
        ) ||
        latex ===
          normalizeLatex(
            String.raw`\frac{1}{m} \vec{e}_{x} \cdot \vec{F}_{g} = \frac{\vec{e}_{x} \cdot m \ddot{\vec{r}}}{m}`
          )
    ).toBe(true);
  });

  it("matches the plan→target→apply pipeline used by the drag handler", () => {
    const tree = treefromLatex(
      String.raw`\vec{e}_{x} \cdot \vec{F}_{g} = \vec{e}_{x} \cdot m \ddot{\vec{r}}`
    );

    const mId = findNodeByLatex(tree, "m");
    const lhsRootId = tree.childrenById[tree.rootId!]?.[0];
    const plan = {
      kind: "MoveAcrossEqual" as const,
      movedId: mId,
      equalId: tree.rootId!,
      fromSide: 1 as const,
      toSide: 0 as const,
      drop: {
        kind: "ontoSideRoot" as const,
        replaceId: lhsRootId!,
        replaceParentId: tree.rootId!,
        replaceSlot: 0 as const,
        insertIndex: 0 as const,
      },
    };

    const moveTarget = planToApplyMoveTarget(plan);
    expect(moveTarget).toEqual({ hoverId: lhsRootId, targetSlot: 0 });

    const effectiveSelectedIds = normalizeSelectedIdsForMove({
      tree,
      selectedIds: [mId],
      mode: "multiplicative",
      hoverId: moveTarget!.hoverId,
    });

    const next = applyMove({
      tree,
      selectedIds: effectiveSelectedIds,
      hoverId: moveTarget!.hoverId,
      targetSlot: moveTarget!.targetSlot,
      mode: "multiplicative",
    });

    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(
      normalizeLatex(
        String.raw`\frac{1}{m} \vec{e}_{x} \cdot \vec{F}_{g} = \vec{e}_{x} \cdot \ddot{\vec{r}}`
      )
    );
  });

  it("applies when hoverId is the basis vector child (not the side root)", () => {
    const tree = treefromLatex(
      String.raw`\vec{e}_{x} \cdot \vec{F}_{g} = \vec{e}_{x} \cdot m \ddot{\vec{r}}`
    );

    const mId = findNodeByLatex(tree, "m");
    const basisId = findNodeByLatex(tree, String.raw`\vec{e}_{x}`);

    const next = applyMove({
      tree,
      selectedIds: [mId],
      hoverId: basisId,
      targetSlot: 0,
      mode: "multiplicative",
    });

    expect(next).not.toBeNull();
    const latex = normalizeLatex(next!.latexPlain);
    expect(latex === normalizeLatex(String.raw`\frac{1}{m} \vec{e}_{x} \cdot \vec{F}_{g} = \vec{e}_{x} \cdot \ddot{\vec{r}}`) ||
      latex === normalizeLatex(String.raw`\frac{\vec{e}_{x} \cdot \vec{F}_{g}}{m} = \vec{e}_{x} \cdot \ddot{\vec{r}}`)).toBe(true);
  });

  it("lifts a scalar factor out of a dot-product operand on the same side when hovering the dot", () => {
    const tree = treefromLatex(String.raw`\vec{a} \cdot m \vec{b}`);

    const mId = findNodeByLatex(tree, "m");
    const dotId = tree.rootId!;

    const next = applyMove({
      tree,
      selectedIds: [mId],
      hoverId: dotId,
      targetSlot: 0,
      mode: "multiplicative",
    });

    expect(next).not.toBeNull();
    expect(normalizeLatex(next!.latexPlain)).toBe(
      normalizeLatex(String.raw`m \vec{a} \cdot \vec{b}`)
    );
  });
});
