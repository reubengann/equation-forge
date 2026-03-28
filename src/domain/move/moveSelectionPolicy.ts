import type { ExpressionTree } from "../../ExpressionTree";
import type { MoveMode } from "../../moveExpression/applyMove";

export const isVectorNode = (info?: { op?: string; latex?: string }) =>
  info?.op === "OverVector" ||
  info?.op === "Vector" ||
  // Treat overdots as vector-like so we avoid collapsing scalar factors with
  // time-derivative operands when moving across '='.
  info?.op === "OverDot" ||
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

/**
 * Find the lowest common ancestor that is a multiplicative container directly
 * under an Equal. This lets us promote multi-selection cases where the user
 * clicked inside different children (e.g., a subscript symbol and a function
 * call) that together form a product term on one side of an equation.
 */
function lcaMulUnderEqual(
  tree: ExpressionTree,
  ids: string[]
): string | null {
  if (ids.length < 2) return null;

  const isUnderEqualSide = (nodeId: string): boolean => {
    let cur: string | null | undefined = tree.parentById[nodeId];
    while (cur) {
      const op = tree.nodesById[cur]?.op;
      if (op === "Equal") return true;
      if (
        op === "Add" ||
        op === "Negate" ||
        op === "Divide"
      ) {
        cur = tree.parentById[cur];
        continue;
      }
      cur = tree.parentById[cur];
    }
    return false;
  };

  const ancestorSets = ids.map((id) => {
    const chain: string[] = [];
    let cur: string | null | undefined = id;
    while (cur) {
      chain.push(cur);
      cur = tree.parentById[cur] ?? null;
    }
    return chain;
  });

  // Intersect ancestor chains, preserving order from closest to farthest.
  const firstChain = ancestorSets[0];
  for (const candidate of firstChain) {
    const candidateOp = tree.nodesById[candidate]?.op;
    if (!isMulOp(candidateOp)) continue;
    if (!isUnderEqualSide(candidate)) continue;

    const presentInAll = ancestorSets.every((chain) =>
      chain.includes(candidate)
    );
    if (presentInAll) return candidate;
  }

  return null;
}

function findEqualSideRoot(
  tree: ExpressionTree,
  nodeId: string
): { equalId: string; sideSlot: 0 | 1 } | null {
  let cur: string | null | undefined = nodeId;
  while (cur) {
    const parentId: string | null | undefined = tree.parentById[cur];
    if (!parentId) return null;
    const parentOp = tree.nodesById[parentId]?.op;
    if (parentOp === "Equal") {
      const kids = tree.childrenById[parentId] ?? [];
      if (kids.length >= 2) {
        if (kids[0] === cur) return { equalId: parentId, sideSlot: 0 };
        if (kids[1] === cur) return { equalId: parentId, sideSlot: 1 };
      }
      return null;
    }
    cur = parentId;
  }
  return null;
}

function collapseMultiplicativeSelection(args: {
  tree: ExpressionTree;
  ids: string[];
  mode: MoveMode;
  hoverId?: string | null;
  disableEqualPromotion?: boolean;
}) {
  const { tree, ids, mode, hoverId, disableEqualPromotion } = args;
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

      // If hover is across '=', do NOT promote the factor to the whole product
      // (we only want to move the chosen factor across).
      const fromSide = findEqualSideRoot(tree, parentId);
      const hoverSide =
        hoverId != null ? findEqualSideRoot(tree, hoverId) : null;
      const crossEqualHover =
        fromSide &&
        hoverSide &&
        fromSide.equalId === hoverSide.equalId &&
        fromSide.sideSlot !== hoverSide.sideSlot;

      if (
        !parentHasVector &&
        (productParentOp === "Equal" || inDenominator)
      ) {
        // Keep whole denominator together when under a Divide.
        if (inDenominator) return [parentId];
        // For direct Equal child, allow factor-only cross-equal moves.
        if (crossEqualHover && productParentOp === "Equal") return ids;
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
    const parentKids = tree.childrenById[parentId] ?? [];
    const hasFractionChild = parentKids.some(
      (kidId) => tree.nodesById[kidId]?.op === "Divide"
    );
    // Keep factor-level selection inside mixed product/fraction terms so users can
    // drag a factor into a fraction numerator/denominator.
    if (hasFractionChild) return ids;

    let ancestor: string | null | undefined = tree.parentById[parentId];
    while (ancestor) {
      const ancestorOp = tree.nodesById[ancestor]?.op;
      if (ancestorOp === "Equal") return [parentId];
      // Allow climbing through common wrappers on a side of '='
      if (
        ancestorOp === "Add" ||
        ancestorOp === "Negate" ||
        ancestorOp === "Divide"
      ) {
        ancestor = tree.parentById[ancestor];
        continue;
      }
      break;
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

    // If the selected ids live under different branches of the same product
    // (e.g., subscript + cosine), promote to that product when it is directly
    // under an Equal. This matches UI cases where double-click selects multiple
    // factors that together form the term to move.
    const lcaProductId = lcaMulUnderEqual(tree, ids);
    if (lcaProductId && !disableEqualPromotion) {
      return [lcaProductId];
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
    hoverId,
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
