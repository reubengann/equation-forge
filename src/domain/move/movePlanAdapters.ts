import type { MovePlan } from "./planMove";

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
        `then insert ${plan.movedId} from Add ${plan.fromAddId}[${plan.fromIndex}] ${
          plan.insertIndex === 0 ? "before" : "after"
        } it`,
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
    case "LiftDotScalar": {
      const posLabel = plan.insertIndex === 0 ? "before" : "after";
      return `Lift scalar ${plan.movedId} out of DotProduct ${plan.dotId} and place ${posLabel} it`;
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
    case "LiftDotScalar":
      return { hoverId: plan.dotId, targetSlot: plan.insertIndex };
    default:
      return null;
  }
}
