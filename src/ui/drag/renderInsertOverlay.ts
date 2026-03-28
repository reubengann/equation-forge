import type { ExpressionTree } from "../../ExpressionTree";
import type { MovePlan } from "../../domain/move/planMove";
import type { RectProvider } from "../../domain/move/planMoveGeometry";
import type { RectLTRB } from "../../rectMath";

function rectForVisual(
  nodeId: string,
  rectFor: RectProvider,
  tree: ExpressionTree | null
): RectLTRB | null {
  const base = rectFor(nodeId);
  const n = tree?.nodesById[nodeId];

  if (n?.op === "Negate") {
    const kids = tree?.childrenById[nodeId] ?? [];
    if (kids.length === 1) {
      const kidRect = rectFor(kids[0]);
      if (kidRect) return kidRect;
    }
  }

  return base;
}

function insertXForAdd(
  addId: string,
  slot: number,
  tree: ExpressionTree | null,
  rectFor: RectProvider
): number | null {
  if (!tree) return null;
  const childIds = tree.childrenById[addId] ?? [];
  if (!childIds.length) return null;

  const rects: Array<RectLTRB | null> = childIds.map((id) =>
    rectForVisual(id, rectFor, tree)
  );

  const n = childIds.length;
  const s = Math.max(0, Math.min(n, slot));

  const prevRect = (() => {
    for (let i = s - 1; i >= 0; i--) {
      if (rects[i]) return rects[i]!;
    }
    return null;
  })();

  const nextRect = (() => {
    for (let i = s; i < n; i++) {
      if (rects[i]) return rects[i]!;
    }
    return null;
  })();

  if (!prevRect && !nextRect) return null;
  if (!prevRect) return nextRect ? nextRect.left : null;
  if (!nextRect) return prevRect.right;

  // Use a midpoint between the nearest visible neighbors.
  return (prevRect.right + nextRect.left) / 2;
}

export function computeInsertX(
  plan: MovePlan | null,
  tree: ExpressionTree | null,
  rectFor: RectProvider
): number | null {
  if (!plan || !tree) return null;

  if (plan.kind === "ReorderAdd") {
    const childIds = tree.childrenById[plan.addId] ?? [];
    const n = childIds.length;
    const slot =
      n > 0
        ? Math.max(
            0,
            Math.min(
              n,
              plan.toIndex + (plan.toIndex >= plan.fromIndex ? 1 : 0)
            )
          )
        : plan.toIndex;
    return insertXForAdd(plan.addId, slot, tree, rectFor);
  }
  if (plan.kind === "InsertIntoAdd") {
    return insertXForAdd(plan.toAddId, plan.toIndex, tree, rectFor);
  }
  if (plan.kind === "WrapIntoAddThenInsert") {
    const r = rectFor(plan.replaceId);
    if (!r) return null;
    return plan.insertIndex === 0 ? r.left : r.right;
  }
  if (plan.kind === "FactorOutOfIntegrate") {
    const r = rectFor(plan.integrateId);
    if (!r) return null;
    return plan.insertIndex === 0 ? r.left : r.right;
  }
  if (plan.kind === "MoveAcrossEqual") {
    if (plan.drop.kind === "intoAdd") {
      return insertXForAdd(plan.drop.addId, plan.drop.toIndex, tree, rectFor);
    }
    if (plan.drop.kind === "ontoSideRootWhole") {
      // No X coordinate needed for horizontal underline
      return null;
    }
    const r = rectFor(plan.drop.replaceId);
    if (!r) return null;
    return plan.drop.insertIndex === 0 ? r.left : r.right;
  }
  if (plan.kind === "MergeIntoFractionNumerator") {
    return null;
  }
  if (plan.kind === "LiftDotScalar") {
    const r = rectFor(plan.dotId);
    if (!r) return null;
    return plan.insertIndex === 0 ? r.left : r.right;
  }

  return null;
}

export function targetRectForPlan(
  plan: MovePlan | null,
  rectFor: RectProvider
): RectLTRB | null {
  if (!plan) return null;
  if (plan.kind === "ReorderAdd") return rectFor(plan.addId);
  if (plan.kind === "InsertIntoAdd") return rectFor(plan.toAddId);
  if (plan.kind === "WrapIntoAddThenInsert") return rectFor(plan.replaceId);
  if (plan.kind === "FactorOutOfIntegrate") return rectFor(plan.integrateId);
  if (plan.kind === "MoveAcrossEqual") {
    if (plan.drop.kind === "intoAdd") return rectFor(plan.drop.addId);
    return rectFor(plan.drop.replaceId);
  }
  if (plan.kind === "MergeIntoFractionNumerator")
    return rectFor(plan.divideId);
  if (plan.kind === "LiftDotScalar") return rectFor(plan.dotId);
  return null;
}

export function renderInsertOverlay(
  plan: MovePlan | null,
  overlay: HTMLDivElement | null,
  mathDivEl: HTMLElement | null,
  rectFor: RectProvider,
  tree: ExpressionTree | null
) {
  if (!overlay || !mathDivEl) return;

  overlay.replaceChildren();
  if (!plan) return;

  const hostRect = mathDivEl.getBoundingClientRect();
  const targetRect = targetRectForPlan(plan, rectFor);
  if (!targetRect) return;

  // Special-case: merging into a fraction numerator — underline the numerator zone.
  if (plan.kind === "MergeIntoFractionNumerator") {
    const numeratorId = tree?.childrenById[plan.divideId]?.[0];
    const numeratorRect =
      (numeratorId && rectFor(numeratorId)) || rectFor(plan.divideId);
    if (!numeratorRect) return;

    const line = document.createElement("div");
    line.style.position = "absolute";
    // Draw a vertical line on the chosen insertion side of numerator.
    const x =
      plan.insertIndex === 0 ? numeratorRect.left - 4 : numeratorRect.right + 4;
    line.style.left = `${x - hostRect.left}px`;
    line.style.top = `${numeratorRect.top - hostRect.top}px`;
    line.style.width = "2px";
    line.style.height = `${numeratorRect.bottom - numeratorRect.top}px`;
    line.style.background = "rgba(124, 77, 255, 0.9)";
    line.style.pointerEvents = "none";
    overlay.appendChild(line);
    return;
  }

  // Handle horizontal underline for ontoSideRootWhole
  if (
    plan.kind === "MoveAcrossEqual" &&
    plan.drop.kind === "ontoSideRootWhole"
  ) {
    const line = document.createElement("div");
    line.style.position = "absolute";
    line.style.left = `${targetRect.left - hostRect.left}px`;
    line.style.top = `${targetRect.bottom - hostRect.top + 2}px`; // Just below the target
    line.style.width = `${targetRect.right - targetRect.left}px`;
    line.style.height = "2px";
    line.style.background = "rgba(124, 77, 255, 0.9)";
    line.style.pointerEvents = "none";
    overlay.appendChild(line);
    return;
  }

  // Vertical line for other cases
  const x = computeInsertX(plan, tree, rectFor);
  if (x == null) return;

  const line = document.createElement("div");
  line.style.position = "absolute";
  line.style.left = `${x - hostRect.left}px`;
  line.style.top = `${targetRect.top - hostRect.top}px`;
  line.style.width = "2px";
  line.style.height = `${targetRect.bottom - targetRect.top}px`;
  line.style.background = "rgba(124, 77, 255, 0.9)";
  line.style.pointerEvents = "none";

  overlay.appendChild(line);
}
