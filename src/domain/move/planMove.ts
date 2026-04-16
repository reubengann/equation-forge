import type { ExpressionTree } from "../../ExpressionTree";
import type { MoveMode } from "../../moveExpression/applyMove";
import { isStructurallyValidMove } from "../../movePath";
import { normalizeSelection } from "../../selectionSemantics";
import {
  computeSlotByMidpoints,
  containsPoint,
  determineMultiplicativeDropKind,
  midX,
  yGate,
  type RectProvider,
} from "./planMoveGeometry";
import { isAncestorOrSelf, resolveHoverTarget } from "./planMoveHoverTarget";
import {
  hasVectorAncestor,
  normalizeSelectedIdsForMove,
} from "./moveSelectionPolicy";

export type MovePlan =
  | {
      kind: "ReorderAdd";
      addId: string;
      movedId: string;
      fromIndex: number;
      toIndex: number; // destination index in FINAL children array (length unchanged)
    }
  | {
      kind: "InsertIntoAdd";
      fromAddId: string;
      toAddId: string;
      movedId: string;
      fromIndex: number;
      toIndex: number; // insertion index in FINAL target children array (0..m)
    }
  | {
      kind: "WrapIntoAddThenInsert";
      movedId: string;
      fromAddId: string;
      fromIndex: number;

      // We will replace replaceId with Add(replaceId, movedId) or Add(movedId, replaceId)
      replaceId: string;

      // Where replaceId lives (e.g. Equal’s RHS)
      replaceParentId: string;
      replaceSlot: number; // typically 0 or 1 for Equal

      // 0 => moved before existing, 1 => moved after existing
      insertIndex: 0 | 1;
    }
  | {
      kind: "FactorOutOfIntegrate";
      movedId: string;
      fromMulId: string;
      fromIndex: number;
      integrateId: string;
      insertIndex: 0 | 1; // 0 = before integral, 1 = after
    }
  | {
      kind: "MergeIntoFractionNumerator";
      fromMulId: string;
      divideId: string;
      movedId: string;
      insertIndex: 0 | 1; // 0 = before numerator factors, 1 = after
    }
  | {
      kind: "MergeIntoDelimiterProduct";
      fromMulId: string;
      delimiterId: string;
      movedId: string;
      insertIndex: 0 | 1; // 0 = before inner factors, 1 = after
    }
  | {
      kind: "PullOutOfFraction";
      divideId: string;
      movedId: string;
      insertIndex: 0 | 1; // 0 = before fraction, 1 = after
      targetHoverId?: string; // optional sibling-factor hover target for apply
      strategy?: "adjacentGap" | "ontoFactor";
    }
  | {
      kind: "MoveAcrossEqual";
      movedId: string;

      equalId: string;
      fromSide: 0 | 1; // 0=LHS, 1=RHS
      toSide: 0 | 1;

      // Where on the destination side the user dropped:
      // Either into an Add container (slot/index), or onto a non-Add side root.
      drop:
        | { kind: "intoAdd"; addId: string; toIndex: number }
        | {
            kind: "ontoSideRoot";
            replaceId: string;
            replaceParentId: string; // should be equalId
            replaceSlot: 0 | 1; // should match toSide
            insertIndex: 0 | 1; // before/after the root expression
          }
        | {
            kind: "ontoSideFactor";
            factorId: string;
            insertIndex: 0 | 1;
          }
        | {
            kind: "ontoSideRootWhole";
            replaceId: string;
            replaceParentId: string; // should be equalId
            replaceSlot: 0 | 1; // should match toSide
          }
        | {
            kind: "ontoSideRootWhole";
            replaceId: string;
            replaceParentId: string; // should be equalId
            replaceSlot: 0 | 1; // should match toSide
          };
    }
  | {
      kind: "LiftDotScalar";
      dotId: string;
      movedId: string;
      operandIndex: 0 | 1;
      insertIndex: 0 | 1;
    };

export interface PlanMoveArgs {
  tree: ExpressionTree;
  selectedIds: string[];
  hoverId: string | null;
  pointer: { x: number; y: number };
  rectFor: RectProvider;
  mode?: MoveMode;
}

function promoteAdditiveMovedId(
  tree: ExpressionTree,
  normalizedSelectedIds: string[],
  movedId: string
): string {
  const climbToAddTerm = (startId: string): string => {
    let termId = startId;
    while (true) {
      const parentId = tree.parentById[termId];
      if (!parentId) return startId;
      const parentOp = tree.nodesById[parentId]?.op;
      if (parentOp === "Delimiter" || parentOp === "Negate") {
        termId = parentId;
        continue;
      }
      return parentOp === "Add" ? termId : startId;
    }
  };

  if (normalizedSelectedIds.length === 1) {
    const onlyId = normalizedSelectedIds[0];
    const onlyOp = tree.nodesById[onlyId]?.op;
    if (onlyOp === "InvisibleOperator" || onlyOp === "Multiply") {
      return climbToAddTerm(onlyId);
    }
    return movedId;
  }

  const parentId = tree.parentById[normalizedSelectedIds[0]];
  if (!parentId) return movedId;
  const parentOp = tree.nodesById[parentId]?.op;
  if (parentOp !== "InvisibleOperator" && parentOp !== "Multiply") return movedId;
  if (!normalizedSelectedIds.every((id) => tree.parentById[id] === parentId)) {
    return movedId;
  }
  const children = tree.childrenById[parentId] ?? [];
  if (children.length === 0) return movedId;
  const selectedSet = new Set(normalizedSelectedIds);
  if (!children.every((id) => selectedSet.has(id))) return movedId;
  return climbToAddTerm(parentId);
}

function findEqualSideRoot(
  tree: ExpressionTree,
  nodeId: string
): { equalId: string; sideRootId: string; sideSlot: 0 | 1 } | null {
  let cur: string | null = nodeId;
  while (cur) {
    const parentId: string | null | undefined = tree.parentById[cur];
    if (!parentId) return null;
    if (tree.nodesById[parentId]?.op === "Equal") {
      const kids = tree.childrenById[parentId] ?? [];
      if (kids.length >= 2) {
        const lhsId = kids[0];
        const rhsId = kids[1];
        if (cur === lhsId)
          return { equalId: parentId, sideRootId: lhsId, sideSlot: 0 };
        if (cur === rhsId)
          return { equalId: parentId, sideRootId: rhsId, sideSlot: 1 };
      }
      return null;
    }
    cur = parentId;
  }
  return null;
}

function isUnderDenominatorOfSideRoot(
  tree: ExpressionTree,
  sideRootId: string,
  nodeId: string,
): boolean {
  let cur: string | null = nodeId;
  while (cur) {
    const parentId: string | null = tree.parentById[cur] ?? null;
    if (!parentId) return false;
    const parentOp = tree.nodesById[parentId]?.op;
    if (parentOp === "Divide" || parentOp === "FractionDerivative") {
      const idx = tree.childIndexById[cur];
      if (idx === 1) return true;
    }
    if (parentId === sideRootId) break;
    cur = parentId;
  }
  return false;
}

function shouldBlockCrossEqualDenominatorMoveFromAddSide(
  tree: ExpressionTree,
  movedId: string,
  fromSideRootId: string,
): boolean {
  if (tree.nodesById[fromSideRootId]?.op !== "Add") return false;
  return isUnderDenominatorOfSideRoot(tree, fromSideRootId, movedId);
}

function normalizeCrossEqualDropForFractionRoot(args: {
  tree: ExpressionTree;
  drop:
    | {
        kind: "ontoSideRootWhole";
        replaceId: string;
        replaceParentId: string;
        replaceSlot: 0 | 1;
      }
    | {
        kind: "ontoSideRoot";
        replaceId: string;
        replaceParentId: string;
        replaceSlot: 0 | 1;
        insertIndex: 0 | 1;
      };
  pointer: { x: number; y: number };
  rectFor: RectProvider;
}):
  | {
      kind: "ontoSideRootWhole";
      replaceId: string;
      replaceParentId: string;
      replaceSlot: 0 | 1;
    }
  | {
      kind: "ontoSideRoot";
      replaceId: string;
      replaceParentId: string;
      replaceSlot: 0 | 1;
      insertIndex: 0 | 1;
    } {
  const { tree, drop, pointer, rectFor } = args;
  if (drop.kind !== "ontoSideRootWhole") return drop;
  if (tree.nodesById[drop.replaceId]?.op !== "Divide") return drop;

  const rect = rectFor(drop.replaceId);
  const insertIndex: 0 | 1 = rect ? (pointer.x < midX(rect) ? 0 : 1) : 1;
  return {
    kind: "ontoSideRoot",
    replaceId: drop.replaceId,
    replaceParentId: drop.replaceParentId,
    replaceSlot: drop.replaceSlot,
    insertIndex,
  };
}

function normalizeCrossEqualDropForSideFactor(args: {
  tree: ExpressionTree;
  sideRootId: string;
  hoverId: string;
  drop:
    | {
        kind: "ontoSideRootWhole";
        replaceId: string;
        replaceParentId: string;
        replaceSlot: 0 | 1;
      }
    | {
        kind: "ontoSideRoot";
        replaceId: string;
        replaceParentId: string;
        replaceSlot: 0 | 1;
        insertIndex: 0 | 1;
      };
  pointer: { x: number; y: number };
  rectFor: RectProvider;
}):
  | {
      kind: "ontoSideRootWhole";
      replaceId: string;
      replaceParentId: string;
      replaceSlot: 0 | 1;
    }
  | {
      kind: "ontoSideRoot";
      replaceId: string;
      replaceParentId: string;
      replaceSlot: 0 | 1;
      insertIndex: 0 | 1;
    }
  | {
      kind: "ontoSideFactor";
      factorId: string;
      insertIndex: 0 | 1;
    } {
  const { tree, sideRootId, hoverId, drop, pointer, rectFor } = args;
  // Multiplicative cross-equal operations must apply to an entire side.
  // If destination is additive, do not retarget to a single term/factor.
  if (tree.nodesById[sideRootId]?.op === "Add") return drop;
  const sideRootPath = tree.pathById[sideRootId];
  if (!sideRootPath) return drop;

  const isDescendantOfSideRoot = (id: string) => {
    const path = tree.pathById[id];
    if (!path || path.length <= sideRootPath.length) return false;
    return sideRootPath.every((v, i) => path[i] === v);
  };

  const isMulOp = (op?: string) => op === "InvisibleOperator" || op === "Multiply";
  const HIT_PAD = 6;

  const nearestFactorFromHover = (() => {
    let cur: string | null = hoverId;
    while (cur && isDescendantOfSideRoot(cur)) {
      const parentId = tree.parentById[cur];
      if (!parentId || !isDescendantOfSideRoot(parentId)) break;
      if (isMulOp(tree.nodesById[parentId]?.op)) return cur;
      cur = parentId;
    }
    return null;
  })();
  if (nearestFactorFromHover) {
    return {
      kind: "ontoSideFactor",
      factorId: nearestFactorFromHover,
      insertIndex: 1,
    };
  }

  let bestFactorId: string | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const id of Object.keys(tree.nodesById)) {
    if (!isDescendantOfSideRoot(id)) continue;
    const parentId = tree.parentById[id];
    if (!parentId || !isDescendantOfSideRoot(parentId)) continue;
    if (!isMulOp(tree.nodesById[parentId]?.op)) continue;

    const rect = rectFor(id);
    if (!rect || !containsPoint(rect, pointer.x, pointer.y, HIT_PAD)) continue;
    const area = Math.max(1, rect.right - rect.left) * Math.max(1, rect.bottom - rect.top);
    if (area < bestArea) {
      bestArea = area;
      bestFactorId = id;
    }
  }

  if (!bestFactorId) return drop;
  return {
    kind: "ontoSideFactor",
    factorId: bestFactorId,
    insertIndex: 1,
  };
}

function findIntegrateAncestor(
  tree: ExpressionTree,
  nodeId: string | null
): string | null {
  let cur: string | null = nodeId;
  while (cur) {
    const op = tree.nodesById[cur]?.op;
    if (op === "Integrate") return cur;
    cur = tree.parentById[cur] ?? null;
  }
  return null;
}

function childUnderAncestor(
  tree: ExpressionTree,
  ancestorId: string,
  nodeId: string
): string | null {
  let cur: string | null = nodeId;
  while (cur) {
    const parentId: string | null | undefined = tree.parentById[cur];
    if (!parentId) return null;
    if (parentId === ancestorId) return cur;
    cur = parentId;
  }
  return null;
}

function resolveFractionPullOutIntent(args: {
  tree: ExpressionTree;
  divideId: string;
  hoverId: string;
  pointer: { x: number; y: number };
  rectFor: RectProvider;
}):
  | { strategy: "ontoFactor"; targetHoverId: string; insertIndex: 1 }
  | { strategy: "adjacentGap"; insertIndex: 0 | 1 }
  | null {
  const { tree, divideId, hoverId, pointer, rectFor } = args;
  const parentMulId = tree.parentById[divideId];
  if (!parentMulId) return null;
  const parentMulOp = tree.nodesById[parentMulId]?.op;
  const isMulOp = (op?: string) => op === "InvisibleOperator" || op === "Multiply";
  if (!isMulOp(parentMulOp)) return null;

  const parentChildren = tree.childrenById[parentMulId] ?? [];
  const divideIndex = parentChildren.indexOf(divideId);
  if (divideIndex < 0) return null;

  const HIT_PAD = 6;
  for (const siblingId of parentChildren) {
    if (siblingId === divideId) continue;
    const r = rectFor(siblingId);
    if (r && containsPoint(r, pointer.x, pointer.y, HIT_PAD)) {
      return {
        strategy: "ontoFactor",
        targetHoverId: siblingId,
        insertIndex: 1,
      };
    }
  }

  const slot = computeSlotByMidpoints({
    childIds: parentChildren,
    pointerX: pointer.x,
    rectFor,
  });
  if (slot != null) {
    const insertIndex: 0 | 1 = slot <= divideIndex ? 0 : 1;
    return { strategy: "adjacentGap", insertIndex };
  }

  const hoverParentId = tree.parentById[hoverId];
  const hoverInSameMul =
    hoverId === parentMulId || hoverParentId === parentMulId;
  if (hoverInSameMul && hoverId !== parentMulId && hoverId !== divideId) {
    return {
      strategy: "ontoFactor",
      targetHoverId: hoverId,
      insertIndex: 1,
    };
  }

  const divideRect = rectFor(divideId);
  if (divideRect) {
    const insertIndex: 0 | 1 = pointer.x < midX(divideRect) ? 0 : 1;
    return { strategy: "adjacentGap", insertIndex };
  }
  return null;
}

export function planMove(args: PlanMoveArgs): MovePlan | null {
  const {
    tree,
    selectedIds,
    hoverId,
    pointer,
    rectFor,
    mode = "additive",
  } = args;

  const isMulOp = (op?: string) =>
    op === "InvisibleOperator" || op === "Multiply";
  const isDotOp = (op?: string) => op === "DotProduct";
  const isContainerOp = (op?: string) =>
    mode === "multiplicative" ? isMulOp(op) : op === "Add";

  if (!hoverId) return null;

  const normalizedSelectedIds = normalizeSelectedIdsForMove({
    tree,
    selectedIds,
    mode,
    hoverId,
  });

  if (normalizedSelectedIds.length < 1) return null;

  const movedRawId = normalizedSelectedIds[0];
  let movedId = normalizeSelection(tree, movedRawId);
  if (mode === "additive") {
    movedId = promoteAdditiveMovedId(tree, normalizedSelectedIds, movedId);
  }
  const movedIsVector =
    hasVectorAncestor(tree, movedId) || hasVectorAncestor(tree, movedRawId);

  let movedParentId = tree.parentById[movedId];
  if (!movedParentId) return null;

  // Multiplicative: reorder within DotProduct (commutative)
  if (
    mode === "multiplicative" &&
    isDotOp(tree.nodesById[movedParentId]?.op) &&
    (hoverId === movedParentId || tree.parentById[hoverId] === movedParentId)
  ) {
    const dotId = movedParentId;
    const childIds = tree.childrenById[dotId] ?? [];
    if (childIds.length === 2) {
      const containerRect = rectFor(dotId);
      if (!containerRect || yGate(containerRect, pointer.y)) {
        const slot = computeSlotByMidpoints({
          childIds,
          pointerX: pointer.x,
          rectFor,
        });
        const fromIndex = childIds.indexOf(movedId);
        if (fromIndex >= 0) {
          let toIndex = slot <= fromIndex ? slot : slot - 1;
          toIndex = Math.max(0, Math.min(childIds.length - 1, toIndex));
          if (toIndex !== fromIndex) {
            return {
              kind: "ReorderAdd",
              addId: dotId,
              movedId,
              fromIndex,
              toIndex,
            };
          }
        }
      }
    }
  }

  // Merge a sibling factor into the numerator of a fraction within the same product.
  // Allow this in both move modes so additive-mode dragging can still perform
  // the fraction-numerator merge intent.
  if (movedParentId) {
    const parentOp = tree.nodesById[movedParentId]?.op;
    if (isMulOp(parentOp)) {
      const divideId = (() => {
        let current: string | null = hoverId;
        while (current) {
          const parentId: string | null | undefined = tree.parentById[current];
          if (!parentId) return null;
          if (tree.nodesById[parentId]?.op === "Divide") return parentId;
          current = parentId;
        }
        return null;
      })();
      const divideParentId = divideId ? tree.parentById[divideId] : null;
      if (
        divideId &&
        divideParentId === movedParentId &&
        divideId !== movedId
      ) {
        const numeratorId = tree.childrenById[divideId]?.[0];
        const numeratorRect = numeratorId ? rectFor(numeratorId) : null;
        const NUMERATOR_PAD = 6;
        const inNumerator =
          numeratorRect != null &&
          containsPoint(
            numeratorRect,
            pointer.x,
            pointer.y,
            NUMERATOR_PAD
          );
        if (inNumerator) {
          const insertIndex: 0 | 1 =
            pointer.x < midX(numeratorRect) ? 0 : 1;
          return {
            kind: "MergeIntoFractionNumerator",
            fromMulId: movedParentId,
            divideId,
            movedId,
            insertIndex,
          };
        }
      }
    }
  }

  // Merge a sibling factor into a parenthesized product within the same product.
  if (mode === "multiplicative" && movedParentId) {
    const parentOp = tree.nodesById[movedParentId]?.op;
    if (isMulOp(parentOp)) {
      const delimiterId = (() => {
        let current: string | null = hoverId;
        while (current) {
          const parentId: string | null | undefined = tree.parentById[current];
          if (!parentId) return null;
          if (
            parentId === movedParentId &&
            tree.nodesById[current]?.op === "Delimiter"
          ) {
            return current;
          }
          current = parentId;
        }
        return null;
      })();

      if (delimiterId && delimiterId !== movedId) {
        const delimiterInnerId = tree.childrenById[delimiterId]?.[0];
        const delimiterInnerOp = delimiterInnerId
          ? tree.nodesById[delimiterInnerId]?.op
          : null;
        // If the delimiter wraps an additive expression, multiplicative dragging
        // around it should reorder sibling factors, not merge into the delimiter.
        if (delimiterInnerOp === "Add") {
          // continue to generic multiplicative reorder/slot planning below
        } else {
        const delimiterRect = rectFor(delimiterId);
        const DELIMITER_PAD = 6;
        const inDelimiter =
          delimiterRect != null &&
          containsPoint(
            delimiterRect,
            pointer.x,
            pointer.y,
            DELIMITER_PAD
          );

        if (inDelimiter || (hoverId === delimiterId && !delimiterRect)) {
          const insertIndex: 0 | 1 = delimiterRect
            ? pointer.x < midX(delimiterRect)
              ? 0
              : 1
            : 1;
          return {
            kind: "MergeIntoDelimiterProduct",
            fromMulId: movedParentId,
            delimiterId,
            movedId,
            insertIndex,
          };
        }
        }
      }
    }
  }

  // Multiplicative: lift a scalar out of a DotProduct operand onto the dot (before/after).
  // Guard: only when hover is the dot (or another child of the dot, but not the moved node),
  // to avoid triggering on simple click-selection of the scalar itself.
  if (mode === "multiplicative") {
    const findDotAncestor = (id: string | null): string | null => {
      let cur: string | null = id;
      while (cur) {
        const p = tree.parentById[cur];
        if (!p) return null;
        if (tree.nodesById[p]?.op === "DotProduct") return p;
        cur = p;
      }
      return null;
    };

    const dotId = findDotAncestor(movedId);
    const hoverWithinDot =
      dotId &&
      hoverId !== movedId &&
      (hoverId === dotId || (hoverId != null && isAncestorOrSelf(tree, dotId, hoverId)));

    const fromSide = dotId ? findEqualSideRoot(tree, movedId) : null;
    const toSide = dotId ? findEqualSideRoot(tree, dotId) : null;
    const sameSideOrNoEqual =
      !fromSide ||
      !toSide ||
      fromSide.equalId !== toSide.equalId ||
      fromSide.sideSlot === toSide.sideSlot;

    if (dotId && hoverWithinDot && sameSideOrNoEqual && !hasVectorAncestor(tree, movedId)) {
      const kids = tree.childrenById[dotId] ?? [];
      if (kids.length === 2) {
        const operandIndex = kids.findIndex((id) =>
          isAncestorOrSelf(tree, id, movedId)
        );
        if (operandIndex === 0 || operandIndex === 1) {
          const dotRect = rectFor(dotId);
          const insertIndex: 0 | 1 = dotRect
            ? (pointer.x < midX(dotRect) ? 0 : 1)
            : 0;
          return {
            kind: "LiftDotScalar",
            dotId,
            movedId,
            operandIndex: operandIndex as 0 | 1,
            insertIndex,
          };
        }
      }
    }
  }

  // Multiplicative: factor a term out of an integral’s integrand.
  if (mode === "multiplicative") {
    const integrateId =
      findIntegrateAncestor(tree, hoverId) ??
      findIntegrateAncestor(tree, movedId);

    if (integrateId) {
      const hoverWithinIntegrate =
        hoverId != null && isAncestorOrSelf(tree, integrateId, hoverId);
      if (!hoverWithinIntegrate) return null;

      const integrandId = tree.childrenById[integrateId]?.[0];
      const integrateRect = rectFor(integrateId);

      if (
        integrandId &&
        isAncestorOrSelf(tree, integrandId, movedId)
      ) {
        const PAD = 6;
        if (
          integrateRect &&
          !containsPoint(integrateRect, pointer.x, pointer.y, PAD)
        ) {
          return null;
        }

        // Find the nearest multiplicative ancestor within the integrand; if none, fall back to the integrand root (single-term integrand).
        let mulId: string | null = tree.parentById[movedId] ?? null;
        while (
          mulId &&
          !isMulOp(tree.nodesById[mulId]?.op) &&
          isAncestorOrSelf(tree, integrandId, mulId)
        ) {
          mulId = tree.parentById[mulId] ?? null;
        }

        const containerId =
          mulId &&
          isMulOp(tree.nodesById[mulId]?.op) &&
          isAncestorOrSelf(tree, integrandId, mulId)
            ? mulId
            : integrandId;

        // Avoid treating a simple click on the factor as a factor-out: if we're hovering the factor itself and the pointer is within it, bail.
        const movedRect = rectFor(movedId);
        if (
          hoverId === movedId &&
          movedRect &&
          containsPoint(movedRect, pointer.x, pointer.y, PAD)
        )
          return null;

        const fromChildren =
          containerId === integrandId && movedId === integrandId
            ? [movedId]
            : tree.childrenById[containerId] ??
              (containerId === integrandId ? [movedId] : []);
        const fromIndex =
          containerId === integrandId && movedId === integrandId
            ? 0
            : fromChildren.indexOf(movedId);
        if (fromIndex >= 0) {
          const insertIndex: 0 | 1 = integrateRect
            ? pointer.x < midX(integrateRect)
              ? 0
              : 1
            : 1; // fallback when measurement is missing
          return {
            kind: "FactorOutOfIntegrate",
            movedId,
            fromMulId: containerId,
            fromIndex,
            integrateId,
            insertIndex,
          };
        }
      }
    }
  }

  // Multiplicative cross-equal: if source and hover are on opposite sides of the same Equal, synthesize a plan immediately.
  if (mode === "multiplicative") {
    const fromSide = findEqualSideRoot(tree, movedId);
    const toSide = hoverId ? findEqualSideRoot(tree, hoverId) : null;
    if (
      fromSide &&
      toSide &&
      fromSide.equalId === toSide.equalId &&
      fromSide.sideSlot !== toSide.sideSlot
    ) {
      if (
        shouldBlockCrossEqualDenominatorMoveFromAddSide(
          tree,
          movedId,
          fromSide.sideRootId,
        )
      ) {
        return null;
      }
      if (movedIsVector) return null;
      const drop = determineMultiplicativeDropKind({
        sideRootId: toSide.sideRootId,
        pointer,
        rectFor,
        equalId: fromSide.equalId,
        toSide: toSide.sideSlot,
      });
      if (!drop) {
        // Fallback to safer heuristic when rects are missing.
        // Still run side-factor refinement so direct factor hovers remain valid.
        const fallbackDrop = {
          kind: "ontoSideRoot",
          replaceId: toSide.sideRootId,
          replaceParentId: fromSide.equalId,
          replaceSlot: toSide.sideSlot,
          insertIndex: 1,
        } as const;
        const normalizedFallbackDrop = normalizeCrossEqualDropForSideFactor({
          tree,
          sideRootId: toSide.sideRootId,
          hoverId,
          drop: fallbackDrop,
          pointer,
          rectFor,
        });
        return {
          kind: "MoveAcrossEqual",
          movedId,
          equalId: fromSide.equalId,
          fromSide: fromSide.sideSlot,
          toSide: toSide.sideSlot,
          drop: normalizedFallbackDrop,
        };
      }
      const rootNormalizedDrop = normalizeCrossEqualDropForFractionRoot({
        tree,
        drop,
        pointer,
        rectFor,
      });
      const normalizedDrop = normalizeCrossEqualDropForSideFactor({
        tree,
        sideRootId: toSide.sideRootId,
        hoverId,
        drop: rootNormalizedDrop,
        pointer,
        rectFor,
      });
      return {
        kind: "MoveAcrossEqual",
        movedId,
        equalId: fromSide.equalId,
        fromSide: fromSide.sideSlot,
        toSide: toSide.sideSlot,
        drop: normalizedDrop,
      };
    }
  }

  const movedParent = tree.nodesById[movedParentId];
  const isDirectEqualChild = movedParent?.op === "Equal";

  if (isDirectEqualChild) {
    const equalId = movedParentId;
    const eqKids = tree.childrenById[equalId] ?? [];
    const lhsId = eqKids[0];
    const rhsId = eqKids[1];
    if (!lhsId || !rhsId) return null;

    // moved must be exactly lhs or rhs child
    let fromSide: 0 | 1 | null = null;
    if (movedId === lhsId) fromSide = 0;
    else if (movedId === rhsId) fromSide = 1;
    else return null;

    const target = resolveHoverTarget({
      tree,
      hoverId,
      pointer,
      rectFor,
      isContainerOp,
    });
    if (!target) return null;

    // Determine which side the drop is on
    let toSide: 0 | 1 | null = null;
    if (target.kind === "add") {
      if (target.addId === lhsId) toSide = 0;
      else if (target.addId === rhsId) toSide = 1;
      else {
        // If it's some other Add (e.g. nested), find which side it belongs to by ancestry
        const side = isAncestorOrSelf(tree, lhsId, target.addId)
          ? 0
          : isAncestorOrSelf(tree, rhsId, target.addId)
          ? 1
          : null;
        toSide = side;
      }
    } else {
      // replace target already carries which Equal slot it refers to
      toSide = target.replaceSlot as 0 | 1;
    }

    if (toSide == null) return null;
    if (toSide === fromSide) return null; // not a cross-equal intent

    // Now compute "drop" details on the destination side
    if (target.kind === "add") {
      const addId = target.addId;

      const addRect = rectFor(addId);
      if (!addRect) return null;
      if (!yGate(addRect, pointer.y)) return null;

      const kids = tree.childrenById[addId] ?? [];
      if (kids.length < 2) return null;

      const slot = computeSlotByMidpoints({
        childIds: kids,
        pointerX: pointer.x,
        rectFor,
      });

      // NOTE: for cross-equal, no "remove shift" needed because removal happens on the other side
      const toIndex = Math.max(0, Math.min(kids.length, slot));

      return {
        kind: "MoveAcrossEqual",
        movedId,
        equalId,
        fromSide,
        toSide,
        drop: { kind: "intoAdd", addId, toIndex },
      };
    } else {
      const { replaceId, replaceParentId, replaceSlot } = target;

      // Make sure we're really targeting the destination side root
      if (replaceParentId !== equalId) return null;
      if ((replaceSlot as 0 | 1) !== toSide) return null;

      // Confidence gate (same pattern as WrapIntoAddThenInsert)
      const replaceRect = rectFor(replaceId);
      const parentRect = rectFor(replaceParentId);
      const PAD_LOCAL = 6;

      const replaceContains =
        replaceRect != null &&
        containsPoint(replaceRect, pointer.x, pointer.y, PAD_LOCAL);
      const parentContains =
        parentRect != null &&
        containsPoint(parentRect, pointer.x, pointer.y, PAD_LOCAL);

      if (!replaceContains && !parentContains) return null;

      // For multiplicative mode, use hit-zone logic
      if (mode === "multiplicative") {
        const drop = determineMultiplicativeDropKind({
          sideRootId: replaceId,
          pointer,
          rectFor,
          equalId,
          toSide,
        });
        if (!drop) {
          // Fallback when rects are missing
          let insertIndex: 0 | 1 = 1;
          if (replaceRect) insertIndex = pointer.x < midX(replaceRect) ? 0 : 1;
          return {
            kind: "MoveAcrossEqual",
            movedId,
            equalId,
            fromSide,
            toSide,
            drop: {
              kind: "ontoSideRoot",
              replaceId,
              replaceParentId,
              replaceSlot: replaceSlot as 0 | 1,
              insertIndex,
            },
          };
        }
        return {
          kind: "MoveAcrossEqual",
          movedId,
          equalId,
          fromSide,
          toSide,
          drop,
        };
      }

      // Additive mode: use existing logic
      let insertIndex: 0 | 1 = 1;
      if (replaceRect) insertIndex = pointer.x < midX(replaceRect) ? 0 : 1;

      return {
        kind: "MoveAcrossEqual",
        movedId,
        equalId,
        fromSide,
        toSide,
        drop: {
          kind: "ontoSideRoot",
          replaceId,
          replaceParentId,
          replaceSlot: replaceSlot as 0 | 1,
          insertIndex,
        },
      };
    }
  }

  // Multiplicative: pull a factor out of a fraction term inside a product.
  // Use semantic intent derived from pointer geometry, not raw hoverId shape,
  // so symbol factors and wrapped differential factors behave consistently.
  if (mode === "multiplicative") {
    const divideId =
      tree.nodesById[movedParentId]?.op === "Divide"
        ? movedParentId
        : isMulOp(tree.nodesById[movedParentId]?.op) &&
            tree.nodesById[tree.parentById[movedParentId] ?? ""]?.op === "Divide"
          ? (tree.parentById[movedParentId] as string)
          : null;
    if (!divideId) {
      // continue
    } else {
    const enclosingDelimiterId = tree.parentById[divideId];
    const enclosingDelimiterOp = enclosingDelimiterId
      ? tree.nodesById[enclosingDelimiterId]?.op
      : null;
    const outerMulId = enclosingDelimiterId
      ? tree.parentById[enclosingDelimiterId]
      : null;
    const outerMulOp = outerMulId ? tree.nodesById[outerMulId]?.op : null;
    const hoverInOuterMul =
      !!outerMulId &&
      (hoverId === outerMulId || tree.parentById[hoverId] === outerMulId);
    if (
      enclosingDelimiterId &&
      enclosingDelimiterOp === "Delimiter" &&
      outerMulId &&
      isMulOp(outerMulOp) &&
      hoverInOuterMul
    ) {
      const delimiterRect = rectFor(enclosingDelimiterId);
      const insertIndex: 0 | 1 = delimiterRect
        ? pointer.x < midX(delimiterRect)
          ? 0
          : 1
        : 1;
      return {
        kind: "PullOutOfFraction",
        divideId,
        movedId,
        insertIndex,
        strategy: "ontoFactor",
        targetHoverId: enclosingDelimiterId,
      };
    }

    const intent = resolveFractionPullOutIntent({
      tree,
      divideId,
      hoverId,
      pointer,
      rectFor,
    });
    if (intent) {
      return {
        kind: "PullOutOfFraction",
        divideId,
        movedId,
        insertIndex: intent.insertIndex,
        strategy: intent.strategy,
        targetHoverId:
          intent.strategy === "ontoFactor"
            ? intent.targetHoverId
            : undefined,
      };
    }
      // Side-root fraction pull-out: support dropping on the side body/whitespace
      // when the moved factor is inside the fraction numerator/denominator.
      if (
        hoverId === divideId ||
        isAncestorOrSelf(tree, hoverId, divideId) ||
        isAncestorOrSelf(tree, divideId, hoverId)
      ) {
        const divideRect = rectFor(divideId);
        const insertIndex: 0 | 1 = divideRect
          ? pointer.x < midX(divideRect)
            ? 0
            : 1
          : 1;
        return {
          kind: "PullOutOfFraction",
          divideId,
          movedId,
          insertIndex,
          strategy: "adjacentGap",
        };
      }
    }
  }

  const fromAddId = tree.parentById[movedId];
  if (!fromAddId) return null;

  const fromAddNode = tree.nodesById[fromAddId];
  if (!fromAddNode || !isContainerOp(fromAddNode.op)) return null;

  const fromChildren = tree.childrenById[fromAddId] ?? [];
  if (fromChildren.length < 2) return null;

  const fromIndex = fromChildren.indexOf(movedId);
  if (fromIndex < 0) return null;

  const target = resolveHoverTarget({
    tree,
    hoverId:
      mode === "multiplicative" &&
      movedParentId != null &&
      isMulOp(tree.nodesById[movedParentId]?.op) &&
      tree.nodesById[tree.parentById[movedParentId] ?? ""]?.op !== "Divide" &&
      isAncestorOrSelf(tree, hoverId, movedParentId)
        ? movedParentId
        : hoverId,
    pointer,
    rectFor,
    // In multiplicative mode, we still want to detect Add side-roots so that
    // edge drops around a fraction term can be routed to executor pull-out logic.
    isContainerOp:
      mode === "multiplicative"
        ? (op?: string) => isMulOp(op) || op === "Add"
        : isContainerOp,
  });

  // Multiplicative cross-equal: if source and hover are on opposite Equal sides, synthesize a MoveAcrossEqual.
  if (mode === "multiplicative") {
    const fromSide = findEqualSideRoot(tree, movedId);
    const toSide = hoverId ? findEqualSideRoot(tree, hoverId) : null;
    if (
      fromSide &&
      toSide &&
      fromSide.equalId === toSide.equalId &&
      fromSide.sideSlot !== toSide.sideSlot
    ) {
      if (
        shouldBlockCrossEqualDenominatorMoveFromAddSide(
          tree,
          movedId,
          fromSide.sideRootId,
        )
      ) {
        return null;
      }
      if (movedIsVector) return null;
      const drop = determineMultiplicativeDropKind({
        sideRootId: toSide.sideRootId,
        pointer,
        rectFor,
        equalId: fromSide.equalId,
        toSide: toSide.sideSlot,
      });
      if (!drop) {
        // Fallback to safer heuristic when rects are missing.
        // Still run side-factor refinement so direct factor hovers remain valid.
        const fallbackDrop = {
          kind: "ontoSideRoot",
          replaceId: toSide.sideRootId,
          replaceParentId: fromSide.equalId,
          replaceSlot: toSide.sideSlot,
          insertIndex: 1,
        } as const;
        const normalizedFallbackDrop = normalizeCrossEqualDropForSideFactor({
          tree,
          sideRootId: toSide.sideRootId,
          hoverId,
          drop: fallbackDrop,
          pointer,
          rectFor,
        });
        return {
          kind: "MoveAcrossEqual",
          movedId,
          equalId: fromSide.equalId,
          fromSide: fromSide.sideSlot,
          toSide: toSide.sideSlot,
          drop: normalizedFallbackDrop,
        };
      }
      const rootNormalizedDrop = normalizeCrossEqualDropForFractionRoot({
        tree,
        drop,
        pointer,
        rectFor,
      });
      const normalizedDrop = normalizeCrossEqualDropForSideFactor({
        tree,
        sideRootId: toSide.sideRootId,
        hoverId,
        drop: rootNormalizedDrop,
        pointer,
        rectFor,
      });
      return {
        kind: "MoveAcrossEqual",
        movedId,
        equalId: fromSide.equalId,
        fromSide: fromSide.sideSlot,
        toSide: toSide.sideSlot,
        drop: normalizedDrop,
      };
    }
  }

  // Multiplicative cross-equal: if source/target are on opposite sides of the same Equal, synthesize a MoveAcrossEqual.
  if (mode === "multiplicative") {
    const fromSide = findEqualSideRoot(tree, movedId);
    const toSide =
      target && target.kind === "replace"
        ? findEqualSideRoot(tree, target.replaceId)
        : target && target.kind === "add"
        ? findEqualSideRoot(tree, target.addId)
        : null;
    if (
      fromSide &&
      toSide &&
      fromSide.equalId === toSide.equalId &&
      fromSide.sideSlot !== toSide.sideSlot
    ) {
      if (movedIsVector) return null;
      const drop = determineMultiplicativeDropKind({
        sideRootId: toSide.sideRootId,
        pointer,
        rectFor,
        equalId: fromSide.equalId,
        toSide: toSide.sideSlot,
      });
      if (!drop) {
        // Fallback to safer heuristic when rects are missing.
        // Still run side-factor refinement so direct factor hovers remain valid.
        const fallbackDrop = {
          kind: "ontoSideRoot",
          replaceId: toSide.sideRootId,
          replaceParentId: fromSide.equalId,
          replaceSlot: toSide.sideSlot,
          insertIndex: 1,
        } as const;
        const normalizedFallbackDrop = normalizeCrossEqualDropForSideFactor({
          tree,
          sideRootId: toSide.sideRootId,
          hoverId,
          drop: fallbackDrop,
          pointer,
          rectFor,
        });
        return {
          kind: "MoveAcrossEqual",
          movedId,
          equalId: fromSide.equalId,
          fromSide: fromSide.sideSlot,
          toSide: toSide.sideSlot,
          drop: normalizedFallbackDrop,
        };
      }
      const rootNormalizedDrop = normalizeCrossEqualDropForFractionRoot({
        tree,
        drop,
        pointer,
        rectFor,
      });
      const normalizedDrop = normalizeCrossEqualDropForSideFactor({
        tree,
        sideRootId: toSide.sideRootId,
        hoverId,
        drop: rootNormalizedDrop,
        pointer,
        rectFor,
      });
      return {
        kind: "MoveAcrossEqual",
        movedId,
        equalId: fromSide.equalId,
        fromSide: fromSide.sideSlot,
        toSide: toSide.sideSlot,
        drop: normalizedDrop,
      };
    }
  }
  if (!target) return null;

  // --- If we’re over an Add, we can either reorder or insert into another Add ---
  if (target.kind === "add") {
    const toAddId = target.addId;

    const toAddRect = rectFor(toAddId);
    const toChildren = tree.childrenById[toAddId] ?? [];
    if (toChildren.length < 2) return null;

    let slot: number | null = null;
    // Prefer sibling-hover sloting when hovering a direct Add child. This keeps
    // drop planning stable for duplicate-looking terms where midpoint sloting can
    // collapse to "no move" while the cursor is clearly on a sibling term edge.
    const hoveredTermId = childUnderAncestor(tree, toAddId, hoverId) ?? hoverId;
    if (tree.parentById[hoveredTermId] === toAddId) {
      const hoverIndex = toChildren.indexOf(hoveredTermId);
      if (hoverIndex >= 0) {
        const hoverRect = rectFor(hoveredTermId);
        slot =
          hoverRect != null
            ? pointer.x < midX(hoverRect)
              ? hoverIndex
              : hoverIndex + 1
            : hoverIndex + 1;
      }
    }
    if (slot == null) {
      if (!toAddRect) return null;
      if (!yGate(toAddRect, pointer.y)) return null;
      slot = computeSlotByMidpoints({
        childIds: toChildren,
        pointerX: pointer.x,
        rectFor,
      });
    }

    // Reorder within same Add
    if (toAddId === fromAddId) {
      let toIndex = slot <= fromIndex ? slot : slot - 1;
      toIndex = Math.max(0, Math.min(toChildren.length - 1, toIndex));
      if (toIndex === fromIndex) return null;

      return {
        kind: "ReorderAdd",
        addId: fromAddId,
        movedId,
        fromIndex,
        toIndex,
      };
    }

    // Insert into different Add: structural bans
    if (isAncestorOrSelf(tree, movedId, toAddId)) return null;
    const ban = isStructurallyValidMove(tree, movedId, toAddId);
    if (ban) return null;

    const toIndex = Math.max(0, Math.min(toChildren.length, slot));

    return {
      kind: "InsertIntoAdd",
      fromAddId,
      toAddId,
      movedId,
      fromIndex,
      toIndex,
    };
  }

  // --- Otherwise: we’re over a non-Add side of an Equal; plan an explicit wrap ---
  const { replaceId, replaceParentId, replaceSlot } = target;

  // Don’t allow replacing something inside the moved subtree
  if (isAncestorOrSelf(tree, movedId, replaceId)) return null;

  const PAD = 6;
  const replaceRect = rectFor(replaceId);
  const parentRect = rectFor(replaceParentId);

  // Confidence gate:
  // - Prefer replaceRect containment (best).
  // - Otherwise, allow parentRect containment only if replaceRect is missing BUT parentRect is measurable.
  // - If neither measurable+containing, bail.
  const replaceContains =
    replaceRect != null &&
    containsPoint(replaceRect, pointer.x, pointer.y, PAD);
  const parentContains =
    parentRect != null && containsPoint(parentRect, pointer.x, pointer.y, PAD);

  if (!replaceContains && !parentContains) return null;

  // If we have replaceRect, use it for before/after.
  // Otherwise default to "after" (we know we're on the correct side, but not the fine position).
  let insertIndex: 0 | 1 = 1;
  if (replaceRect) {
    insertIndex = pointer.x < midX(replaceRect) ? 0 : 1;
  }

  return {
    kind: "WrapIntoAddThenInsert",
    movedId,
    fromAddId,
    fromIndex,
    replaceId,
    replaceParentId,
    replaceSlot,
    insertIndex,
  };
}

export type { RectProvider };
