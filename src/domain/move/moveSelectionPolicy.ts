import type { ExpressionTree } from "../../ExpressionTree";
import type { MoveMode } from "../../moveExpression/applyMove";

export const isVectorNode = (info?: { op?: string; latex?: string }) =>
  info?.op === "OverVector" ||
  info?.op === "Vector" ||
  (info?.op === "Symbol" && (info?.latex ?? "").includes("\\vec"));

export function hasVectorAncestor(
  tree: ExpressionTree,
  nodeId: string | null | undefined
): boolean {
  if (!nodeId) return false;
  let cur: string | null | undefined = nodeId;
  while (cur) {
    if (isVectorNode(tree.nodesById[cur])) return true;
    cur = tree.parentById[cur] ?? null;
  }
  return false;
}

/**
 * Normalize a draggable handle so that clicks inside Negate/Subscript/OverVector
 * bubble to the wrapper node (aligned with selectionSemantics.normalizeSelection).
 */
export function normalizeDragHandleId(
  tree: ExpressionTree,
  nodeId: string
): string {
  let cur = nodeId;
  while (true) {
    const parent = tree.parentById[cur];
    if (!parent) return cur;
    const op = tree.nodesById[parent]?.op;
    if (
      op === "Negate" ||
      op === "Subscript" ||
      op === "OverVector" ||
      op === "Vector"
    ) {
      cur = parent;
      continue;
    }
    return cur;
  }
}

function isMulOp(op?: string | null) {
  return op === "InvisibleOperator" || op === "Multiply";
}

function isAncestorOrSelf(
  tree: ExpressionTree,
  ancestorId: string,
  nodeId: string
): boolean {
  let cur: string | null = nodeId;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = tree.parentById[cur] ?? null;
  }
  return false;
}

function collapseMultiplicativeSelection(args: {
  tree: ExpressionTree;
  ids: string[];
  mode: MoveMode;
  disableEqualPromotion?: boolean;
}) {
  const { tree, ids, mode, disableEqualPromotion } = args;
  if (ids.length === 0) return ids;

  // Single-selection promotion rules
  if (ids.length === 1) {
    const id = ids[0];
    const parentId = tree.parentById[id];
    const parentOp = parentId ? tree.nodesById[parentId]?.op : null;

    if (
      mode === "multiplicative" &&
      !disableEqualPromotion &&
      parentId &&
      isMulOp(parentOp)
    ) {
      const productParentId = tree.parentById[parentId];
      const productParentOp = productParentId
        ? tree.nodesById[productParentId]?.op
        : null;
      const parentIndex =
        productParentId != null ? tree.childIndexById[parentId] : null;
      const inDenominator =
        productParentOp === "Divide" && parentIndex === 1;
      const siblings = tree.childrenById[parentId] ?? [];
      const parentHasVector = siblings.some((sibId) =>
        isVectorNode(tree.nodesById[sibId])
      );

      if (
        !parentHasVector &&
        (productParentOp === "Equal" || inDenominator)
      ) {
        return [parentId];
      }
    }

    // Additive mode: promote a factor whose product is a direct child of Equal.
    if (
      mode === "additive" &&
      !disableEqualPromotion &&
      parentId &&
      isMulOp(parentOp)
    ) {
      const productParentId = tree.parentById[parentId];
      if (productParentId) {
        const productParentOp = tree.nodesById[productParentId]?.op;
        if (productParentOp === "Equal") return [parentId];
      }
    }
    return ids;
  }

  // Multiplicative mode: collapse to the shared product container
  if (mode === "multiplicative") {
    const parents = ids.map((id) => tree.parentById[id]).filter(Boolean);
    const uniqueParents = Array.from(new Set(parents));
    if (uniqueParents.length === 1) {
      const parentId = uniqueParents[0]!;
      const pop = tree.nodesById[parentId]?.op;
      if (isMulOp(pop)) {
        return [parentId];
      }
    }
    return ids;
  }

  // Additive mode: collapse factors from the same product when that product is under Equal.
  if (mode === "additive") {
    const parents = ids.map((id) => tree.parentById[id]).filter(Boolean);
    const uniqueParents = Array.from(new Set(parents));
    if (uniqueParents.length === 1) {
      const parentId = uniqueParents[0]!;
      const parentOp = tree.nodesById[parentId]?.op;
      if (isMulOp(parentOp)) {
        const parentChildren = tree.childrenById[parentId] ?? [];
        const allSelectedAreChildren = ids.every((id) =>
          parentChildren.includes(id)
        );
        if (allSelectedAreChildren) {
          const productParentId = tree.parentById[parentId];
          if (productParentId && !disableEqualPromotion) {
            const productParentOp = tree.nodesById[productParentId]?.op;
            if (productParentOp === "Equal") {
              return [parentId];
            }
          }
        }
      }
    }
  }

  return ids;
}

export function normalizeSelectedIdsForMove(args: {
  tree: ExpressionTree | null;
  selectedIds: string[];
  mode: MoveMode;
  hoverId: string | null;
  disableEqualPromotion?: boolean;
}): string[] {
  const { tree, selectedIds, mode, hoverId, disableEqualPromotion } = args;
  if (!tree) return selectedIds;
  if (selectedIds.length === 0) return selectedIds;

  // Normalize drag handles to align with selection semantics.
  const normalizedIds = selectedIds.map((id) =>
    normalizeDragHandleId(tree, id)
  );

  let effectiveIds = collapseMultiplicativeSelection({
    tree,
    ids: normalizedIds,
    mode,
    disableEqualPromotion,
  });

  // Multiplicative rule: if hovering within the same product, keep the original factor to enable reordering.
  if (
    mode === "multiplicative" &&
    normalizedIds.length === 1 &&
    hoverId &&
    tree
  ) {
    const originalId = normalizedIds[0];
    const parentId = tree.parentById[originalId];
    const parentOp = parentId ? tree.nodesById[parentId]?.op : null;
    if (parentId && isMulOp(parentOp) && isAncestorOrSelf(tree, parentId, hoverId)) {
      effectiveIds = [originalId];
    }
  }

  return effectiveIds;
}
