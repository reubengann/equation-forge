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
      if (movedIsVector) return null;
      const drop = determineMultiplicativeDropKind({
        sideRootId: toSide.sideRootId,
        pointer,
        rectFor,
        equalId: fromSide.equalId,
        toSide: toSide.sideSlot,
      });
      if (!drop) {
        // Fallback to safer heuristic when rects are missing
        return {
          kind: "MoveAcrossEqual",
          movedId,
          equalId: fromSide.equalId,
          fromSide: fromSide.sideSlot,
          toSide: toSide.sideSlot,
          drop: {
            kind: "ontoSideRoot",
            replaceId: toSide.sideRootId,
            replaceParentId: fromSide.equalId,
            replaceSlot: toSide.sideSlot,
            insertIndex: 1,
          },
        };
      }
      const normalizedDrop = normalizeCrossEqualDropForFractionRoot({
        tree,
        drop,
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

  // Multiplicative: pulling a factor out of a fraction term often hovers the
  // parent Add edge. Plan this as a wrap-around the Divide so executor receives
  // hover=divide and targetSlot=0/1.
  if (mode === "multiplicative" && tree.nodesById[movedParentId]?.op === "Divide") {
    const targetForFraction = resolveHoverTarget({
      tree,
      hoverId,
      pointer,
      rectFor,
      isContainerOp: (op?: string) => isMulOp(op) || op === "Add",
    });
    if (targetForFraction?.kind === "add") {
      const addId = targetForFraction.addId;
      if (tree.parentById[movedParentId] === addId) {
        const addKids = tree.childrenById[addId] ?? [];
        const divideIndex = addKids.indexOf(movedParentId);
        if (divideIndex >= 0) {
          const slot = computeSlotByMidpoints({
            childIds: addKids,
            pointerX: pointer.x,
            rectFor,
          });
          if (slot >= 0) {
            return {
              kind: "WrapIntoAddThenInsert",
              movedId,
              fromAddId: addId,
              fromIndex: divideIndex,
              replaceId: movedParentId,
              replaceParentId: addId,
              replaceSlot: divideIndex,
              insertIndex: slot <= divideIndex ? 0 : 1,
            };
          }
        }
      }
    }
  }

  // Multiplicative: pulling a factor out of a fraction directly onto a sibling
  // factor in the same product (e.g. drag denominator e onto f in (A/e) f).
  if (mode === "multiplicative" && tree.nodesById[movedParentId]?.op === "Divide") {
    const parentMulId = tree.parentById[movedParentId];
    const parentMulOp = parentMulId ? tree.nodesById[parentMulId]?.op : null;
    const hoverParentId = tree.parentById[hoverId];
    const hoverInSameMul =
      !!parentMulId &&
      isMulOp(parentMulOp) &&
      (hoverId === parentMulId || hoverParentId === parentMulId);

    if (hoverInSameMul) {
      const parentChildren = tree.childrenById[parentMulId!] ?? [];
      const hoverRect = rectFor(hoverId);
      let insertIndex: 0 | 1 = 1;
      if (hoverId === parentMulId) {
        const divideRect = rectFor(movedParentId);
        if (divideRect) {
          insertIndex = pointer.x < midX(divideRect) ? 0 : 1;
        }
      } else if (hoverRect) {
        insertIndex = pointer.x < midX(hoverRect) ? 0 : 1;
      } else {
        const divideIndex = parentChildren.indexOf(movedParentId);
        const hoverIndex = parentChildren.indexOf(hoverId);
        if (hoverIndex >= 0 && divideIndex >= 0) {
          insertIndex = hoverIndex < divideIndex ? 0 : 1;
        }
      }

      return {
        kind: "PullOutOfFraction",
        divideId: movedParentId,
        movedId,
        insertIndex,
      };
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
    hoverId,
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
      if (movedIsVector) return null;
      const drop = determineMultiplicativeDropKind({
        sideRootId: toSide.sideRootId,
        pointer,
        rectFor,
        equalId: fromSide.equalId,
        toSide: toSide.sideSlot,
      });
      if (!drop) {
        // Fallback to safer heuristic when rects are missing
        return {
          kind: "MoveAcrossEqual",
          movedId,
          equalId: fromSide.equalId,
          fromSide: fromSide.sideSlot,
          toSide: toSide.sideSlot,
          drop: {
            kind: "ontoSideRoot",
            replaceId: toSide.sideRootId,
            replaceParentId: fromSide.equalId,
            replaceSlot: toSide.sideSlot,
            insertIndex: 1,
          },
        };
      }
      const normalizedDrop = normalizeCrossEqualDropForFractionRoot({
        tree,
        drop,
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
        // Fallback to safer heuristic when rects are missing
        return {
          kind: "MoveAcrossEqual",
          movedId,
          equalId: fromSide.equalId,
          fromSide: fromSide.sideSlot,
          toSide: toSide.sideSlot,
          drop: {
            kind: "ontoSideRoot",
            replaceId: toSide.sideRootId,
            replaceParentId: fromSide.equalId,
            replaceSlot: toSide.sideSlot,
            insertIndex: 1,
          },
        };
      }
      const normalizedDrop = normalizeCrossEqualDropForFractionRoot({
        tree,
        drop,
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
    if (!toAddRect) return null;
    if (!yGate(toAddRect, pointer.y)) return null;

    const toChildren = tree.childrenById[toAddId] ?? [];
    if (toChildren.length < 2) return null;

    const slot = computeSlotByMidpoints({
      childIds: toChildren,
      pointerX: pointer.x,
      rectFor,
    });

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
