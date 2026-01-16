import type { ExpressionTree } from "../ExpressionTree";
import type { MovePlan } from "../planMove";
import type { RectLTRB } from "../rectMath";
import {
  getMathliveShadowRoot,
  queryElementsByNodeIds,
  unionBoundingClientRects,
} from "../mathliveShadow";

export type RectProvider = (nodeId: string) => RectLTRB | null;

export function createRectProvider(
  measureEl: HTMLElement | null,
  tree: ExpressionTree | null
): RectProvider {
  return (nodeId: string): RectLTRB | null => {
    if (!measureEl || !tree) return null;
    const sr = getMathliveShadowRoot(measureEl);
    if (!sr) return null;

    const els = queryElementsByNodeIds(sr, [nodeId]);
    if (!els.length) return null;

    return unionBoundingClientRects(els);
  };
}

export function rectForVisual(
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

export function describeMovePlan(plan: MovePlan | null): string {
  if (!plan) return "No move intent (planMove returned null)";

  switch (plan.kind) {
    case "ReorderAdd":
      return `Reorder ${plan.movedId} within Add ${plan.addId} from ${plan.fromIndex} to ${plan.toIndex}`;
    case "InsertIntoAdd":
      return `Insert ${plan.movedId} from Add ${plan.fromAddId}[${plan.fromIndex}] into Add ${plan.toAddId} at slot ${plan.toIndex}`;
    case "WrapIntoAddThenInsert":
      return [
        `Wrap ${plan.replaceId} (slot ${plan.replaceSlot}) under parent ${plan.replaceParentId}`,
        `then insert ${plan.movedId} from Add ${plan.fromAddId}[${
          plan.fromIndex
        }] ${plan.insertIndex === 0 ? "before" : "after"} it`,
      ].join(" — ");
    case "MergeIntoFractionNumerator":
      return `Merge ${plan.movedId} into numerator of fraction ${plan.divideId}`;
    case "MoveAcrossEqual": {
      const sideLabel = (side: 0 | 1) => (side === 0 ? "LHS" : "RHS");
      if (plan.drop.kind === "intoAdd") {
        return `Move ${plan.movedId} across '=' ${sideLabel(
          plan.fromSide
        )} → ${sideLabel(plan.toSide)} into Add ${plan.drop.addId} at slot ${
          plan.drop.toIndex
        }`;
      }
      if (plan.drop.kind === "ontoSideRootWhole") {
        return `Move ${plan.movedId} across '=' ${sideLabel(
          plan.fromSide
        )} → ${sideLabel(plan.toSide)} dividing whole expression ${
          plan.drop.replaceId
        }`;
      }
      const posLabel = plan.drop.insertIndex === 0 ? "before" : "after";
      return `Move ${plan.movedId} across '=' ${sideLabel(
        plan.fromSide
      )} → ${sideLabel(plan.toSide)} by wrapping ${
        plan.drop.replaceId
      } and inserting ${posLabel}`;
    }
    default:
      return "Unknown plan";
  }
}

export function planToApplyMoveTarget(plan: MovePlan | null): {
  hoverId: string;
  targetSlot: number | null;
} | null {
  if (!plan) return null;

  switch (plan.kind) {
    case "ReorderAdd":
      // plan.toIndex is the final index after reorder; convert to a slot compatible
      // with movePath.computeDestinationIndex semantics.
      return {
        hoverId: plan.addId,
        targetSlot:
          plan.toIndex <= plan.fromIndex ? plan.toIndex : plan.toIndex + 1,
      };
    case "InsertIntoAdd":
      return { hoverId: plan.toAddId, targetSlot: plan.toIndex };
    case "WrapIntoAddThenInsert":
      return { hoverId: plan.replaceId, targetSlot: plan.insertIndex };
    case "MergeIntoFractionNumerator":
      return { hoverId: plan.divideId, targetSlot: null };
    case "MoveAcrossEqual":
      if (plan.drop.kind === "intoAdd") {
        return { hoverId: plan.drop.addId, targetSlot: plan.drop.toIndex };
      }
      if (plan.drop.kind === "ontoSideRootWhole") {
        return { hoverId: plan.drop.replaceId, targetSlot: null };
      }
      return {
        hoverId: plan.drop.replaceId,
        targetSlot: plan.drop.insertIndex,
      };
    default:
      return null;
  }
}

export function insertXForAdd(
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
            Math.min(n, plan.toIndex + (plan.toIndex >= plan.fromIndex ? 1 : 0))
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
  if (plan.kind === "MoveAcrossEqual") {
    if (plan.drop.kind === "intoAdd") return rectFor(plan.drop.addId);
    return rectFor(plan.drop.replaceId);
  }
  if (plan.kind === "MergeIntoFractionNumerator") return rectFor(plan.divideId);
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
    // Draw a vertical line alongside the numerator to signal the target.
    const GAP = 4;
    line.style.left = `${numeratorRect.left - hostRect.left - GAP}px`;
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
