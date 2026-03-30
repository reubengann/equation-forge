import { ExpressionTree, type MJ, type MJNode } from "../ExpressionTree";
import { getAtPath, routeBetween, setAtPath } from "../movePath";
import { normalizeSelection } from "../selectionSemantics";
import type { Slot } from "./types";

export type State = {
  root: MJ;
  payload:
    | { kind: "Selection"; ids: string[] } // before lift
    | { kind: "Expr"; mj: MJ } // after lift
    | null; // after drop
};

function isOneTerm(mj: MJ): boolean {
  return mj === 1 || mj === "1";
}

function isZeroTerm(mj: MJ): boolean {
  if (mj === 0 || mj === "0") return true;
  if (
    Array.isArray(mj) &&
    mj[0] === "Negate" &&
    ((mj[1] as MJ) === 0 || (mj[1] as MJ) === "0")
  ) {
    return true;
  }
  return false;
}

function normalizeAdd(
  terms: MJ[],
  opts?: { preserveWrapper?: boolean }
): MJ {
  const filtered = terms.filter((t) => !isZeroTerm(t));
  const use = filtered.length === 0 ? [0] : filtered;

  if (use.length === 0) return 0;
  if (use.length === 1) {
    if (opts?.preserveWrapper) return ["Add", ...use] as MJNode;
    return use[0];
  }
  return ["Add", ...use] as MJNode;
}

function normalizeMul(factors: MJ[]): MJ {
  const flattened: MJ[] = [];
  for (const f of factors) {
    if (
      Array.isArray(f) &&
      (f[0] === "InvisibleOperator" || f[0] === "Multiply")
    ) {
      flattened.push(...(f.slice(1) as MJ[]));
    } else {
      flattened.push(f);
    }
  }

  const filtered = flattened.filter((f) => !isOneTerm(f));
  const use = filtered.length === 0 ? [1] : filtered;
  if (use.length === 1) return use[0];
  return ["InvisibleOperator", ...use] as MJNode;
}

function promoteToAdditiveTermRoot(
  tree: ExpressionTree,
  selectedIds: string[]
): string[] {
  const normalized = selectedIds.map((id) => normalizeSelection(tree, id));
  if (normalized.length === 0) return selectedIds;

  const promoteMulTerm = (mulId: string): string[] => {
    let termId = mulId;
    while (true) {
      const parentId = tree.parentById[termId];
      if (!parentId) return [mulId];
      const parentOp = tree.nodesById[parentId]?.op;
      if (parentOp === "Delimiter" || parentOp === "Negate") {
        termId = parentId;
        continue;
      }
      if (parentOp === "Add") return [termId];
      return [mulId];
    }
  };

  if (normalized.length === 1) {
    const only = normalized[0];
    const onlyOp = tree.nodesById[only]?.op;
    if (onlyOp === "InvisibleOperator" || onlyOp === "Multiply") {
      return promoteMulTerm(only);
    }
    return normalized;
  }

  const parentId = tree.parentById[normalized[0]];
  if (!parentId) return normalized;
  const parentOp = tree.nodesById[parentId]?.op;
  if (parentOp !== "InvisibleOperator" && parentOp !== "Multiply") return normalized;
  if (!normalized.every((id) => tree.parentById[id] === parentId)) return normalized;

  const kids = tree.childrenById[parentId] ?? [];
  if (kids.length === 0) return normalized;
  const selectedSet = new Set(normalized);
  const allSelected = kids.every((id) => selectedSet.has(id));
  if (!allSelected) return normalized;

  return promoteMulTerm(parentId);
}

export function stepCrossEqual(state: State): State | null {
  if (state.payload == null) return null;
  if (state.payload.kind !== "Expr") return null;

  const mj = state.payload.mj;

  // Nice-to-have: cancel double negate for cleaner results.
  if (Array.isArray(mj) && mj[0] === "Negate") {
    return { ...state, payload: { kind: "Expr", mj: mj[1] as MJ } };
  }

  return { ...state, payload: { kind: "Expr", mj: ["Negate", mj] as MJNode } };
}

function equalSideChild(
  tree: ExpressionTree,
  equalId: string,
  id: string
): string | null {
  // Returns the direct child of Equal (LHS or RHS root) that contains `id`
  let cur: string | null = id;
  while (cur) {
    const p: string | null = tree.parentById[cur];
    if (!p) return null;
    if (p === equalId) return cur; // cur is the side-root
    cur = p;
  }
  return null;
}

/*
The thinking here is the following: We start with a tree, a selection of nodes, and a destination.
We need to extract the expression from the tree (possibly pruning the tree afterwards). Then we need to find
where to drop it. The drop point may be at the LCA or it may be while traveling down the tree.
*/
export function applyMoveAdditive(args: {
  tree: ExpressionTree;
  selectedIds: string[];
  hoverId: string;
  targetSlot: Slot;
}): ExpressionTree | null {
  // debugger;
  const { tree, selectedIds, hoverId, targetSlot } = args;
  if (targetSlot == null) return null;
  if (selectedIds.length < 1) return null;
  const effectiveSelectedIds = promoteToAdditiveTermRoot(tree, selectedIds);

  // Handle multi-term moves when all selected terms are contiguous siblings in an Add
  if (effectiveSelectedIds.length > 1) {
    const normIds = effectiveSelectedIds.map((id) => normalizeSelection(tree, id));
    const parentId = tree.parentById[normIds[0]];
    if (!parentId) return null;
    const parentOp = tree.nodesById[parentId]?.op;
    if (parentOp !== "Add") return null;

    const idxs = normIds
      .map((id) => tree.childIndexById[id])
      .filter((i) => i != null) as number[];
    if (idxs.length !== normIds.length) return null;
    idxs.sort((a, b) => a - b);

    // Ensure the ids are exactly the slice in order
    const kids = tree.childrenById[parentId] ?? [];
    const start = idxs[0];
    const end = idxs[idxs.length - 1];
    if (end - start + 1 !== idxs.length) return null;
    const sliceIds = kids.slice(start, end + 1);
    if (sliceIds.some((id) => normIds.indexOf(id) === -1)) return null;

    // Only support dropping into an Add target for now; if hoverId is not Add, climb to nearest Add ancestor.
    let targetAddId: string | null = hoverId;
    while (
      targetAddId &&
      tree.nodesById[targetAddId] &&
      tree.nodesById[targetAddId].op !== "Add"
    ) {
      targetAddId = tree.parentById[targetAddId] ?? null;
    }
    if (!targetAddId || tree.nodesById[targetAddId]?.op !== "Add") return null;

    const destPath = tree.pathById[targetAddId];
    const srcPath = tree.pathById[parentId];
    if (!destPath || !srcPath) return null;

    const srcEqualId = tree.parentById[parentId];
    const srcEqualOp = srcEqualId ? tree.nodesById[srcEqualId]?.op : null;
    const isSrcEqual = srcEqualOp === "Equal";

    const destEqualId = isSrcEqual ? srcEqualId : null;
    const srcSideRoot =
      isSrcEqual && srcEqualId
        ? equalSideChild(tree, srcEqualId, parentId)
        : null;
    const destSideRoot =
      isSrcEqual && destEqualId
        ? equalSideChild(tree, destEqualId, hoverId)
        : null;
    const crossEqual =
      isSrcEqual && srcSideRoot && destSideRoot && srcSideRoot !== destSideRoot;

    const normalizeSum = (
      terms: MJ[],
      opts?: { preserveWrapper?: boolean }
    ): MJ => normalizeAdd(terms, opts);

    const negateExpr = (mj: MJ): MJ => {
      if (Array.isArray(mj) && mj[0] === "Negate") return mj[1] as MJ;
      return ["Negate", mj] as MJNode;
    };

    // Remove from source
    const srcMJ = getAtPath(tree.rootJson, srcPath) as MJ;
    if (!Array.isArray(srcMJ) || srcMJ[0] !== "Add") return null;
    const srcTerms = srcMJ.slice(1);
    const movedTerms = srcTerms.slice(start, end + 1);
    const remaining = [...srcTerms.slice(0, start), ...srcTerms.slice(end + 1)];

    let rootAfterRemoval: MJ = tree.rootJson;
    rootAfterRemoval = setAtPath(
      rootAfterRemoval,
      srcPath,
      normalizeSum(remaining, { preserveWrapper: true })
    );

    // Re-read destination terms. Prefer the structural Add JSON from the original tree.
    const destBaseline = tree.nodesById[targetAddId]?.json;
    let destMJRaw: MJ | null = null;
    if (Array.isArray(destBaseline) && destBaseline[0] === "Add") {
      destMJRaw = destBaseline;
    } else {
      const atPath = getAtPath(rootAfterRemoval, destPath) as MJ;
      destMJRaw = atPath;
    }

    const destAddExpr =
      Array.isArray(destMJRaw) && destMJRaw[0] === "Add"
        ? destMJRaw
        : (["Add", destMJRaw] as MJNode);
    const destTerms = destAddExpr.slice(1);

    const toIndexRaw =
      typeof targetSlot === "number" ? targetSlot : destTerms.length;
    const toIndex = Math.max(0, Math.min(destTerms.length, toIndexRaw));

    const wrapIfAdd = (mj: MJ): MJ => {
      if (Array.isArray(mj) && mj[0] === "Add")
        return ["Delimiter", mj] as MJNode;
      if (
        Array.isArray(mj) &&
        mj[0] === "Negate" &&
        Array.isArray(mj[1]) &&
        mj[1][0] === "Add"
      ) {
        return ["Negate", ["Delimiter", mj[1]]] as MJNode;
      }
      return mj;
    };

    let payloadExpr = crossEqual
      ? negateExpr(normalizeSum(movedTerms))
      : normalizeSum(movedTerms);

    payloadExpr = wrapIfAdd(payloadExpr);

    // If we're inserting into the numerator of a Divide, multiply by denominator.
    const destParentId = tree.parentById[targetAddId];
    if (destParentId) {
      const parentNode = tree.nodesById[destParentId];
      const kidsOfParent = tree.childrenById[destParentId] ?? [];
      if (parentNode?.op === "Divide" && kidsOfParent[0] === hoverId) {
        const denId = kidsOfParent[1];
        const denMJ = denId ? tree.nodesById[denId]?.json : null;
        if (denMJ) {
          const isNumericLiteral =
            typeof denMJ === "number" ||
            (Array.isArray(denMJ) &&
              denMJ.length === 2 &&
              denMJ[0] === "Negate" &&
              typeof denMJ[1] === "number");

          const wrappedPayload = wrapIfAdd(payloadExpr);
          const factors = isNumericLiteral
            ? [denMJ, wrappedPayload]
            : [wrappedPayload, denMJ];

          payloadExpr = ["InvisibleOperator", ...factors] as MJNode;
        }
      }
    }

    const nextDestTerms = [
      ...destTerms.slice(0, toIndex),
      payloadExpr,
      ...destTerms.slice(toIndex),
    ];
    const rootAfterInsert = setAtPath(
      rootAfterRemoval,
      destPath,
      normalizeSum(nextDestTerms)
    );

    return ExpressionTree.create(rootAfterInsert);
  }

  const fromIdRaw = effectiveSelectedIds[0];
  const fromId = normalizeSelection(tree, fromIdRaw);
  // Allow moving a whole fraction (Divide) as a term, but still forbid lifting
  // through Divide when the selection is inside numerator/denominator. The actual
  // gate remains in stepUp; this comment documents intended allowance.
  const toId = hoverId;

  const r = routeBetween(tree, fromId, toId);
  if (!r) return null;

  // Stepwise executor state
  let state: State = {
    root: tree.rootJson,
    payload: { kind: "Selection", ids: [fromId] },
  };
  let prevChildId: string | undefined = undefined;

  // 1) walk UP applying lift rules when we hit an Add container
  for (const id of r.up) {
    const nextState = stepUp(tree, state, id, prevChildId);
    if (!nextState) return null;

    state = nextState;
    prevChildId = id;
  }

  // if lift point is the LCA (common for leaf moves within an Add), lift there
  if (
    state.payload?.kind === "Selection" &&
    (tree.nodesById[r.lcaId]?.op === "Add" ||
      tree.nodesById[r.lcaId]?.op === "InvisibleOperator" ||
      tree.nodesById[r.lcaId]?.op === "Multiply")
  ) {
    const nextState = stepUp(tree, state, r.lcaId, prevChildId);
    if (!nextState) return null;
    state = nextState;
  }

  // It's possible that the target is a single term that is a child of an equals sign. If so,
  // and providing we've moved it to the other side, implicitly insert a sum there.
  if (state.payload?.kind === "Selection") {
    const movedId = state.payload.ids[0];
    const p = tree.parentById[movedId];

    // Only if the selected node is a direct child of an Equal
    if (p && tree.nodesById[p]?.op === "Equal") {
      const equalId = p;

      // Determine if destination is on the other side of this Equal
      const fromSide = equalSideChild(tree, equalId, movedId);
      const toSide = equalSideChild(tree, equalId, toId);

      // If we couldn't resolve sides or it's the same side, don't do the "0 replacement" lift.
      // This is what prevents "0 + a = b" when dragging within LHS.
      if (!fromSide || !toSide || fromSide === toSide) {
        return null; // (or return ExpressionTree.create(tree.rootJson) if you want "no-op")
      }

      // Cross-equal move: lift by replacing the moved term with 0 and carrying it as Expr
      const movedPath = tree.pathById[movedId];
      if (!movedPath) return null;

      const movedExpr = getAtPath(state.root, movedPath);
      const rootAfter = setAtPath(state.root, movedPath, 0);

      state = { root: rootAfter, payload: { kind: "Expr", mj: movedExpr } };
    }
  }

  // Must have lifted into an Expr by now
  if (state.payload == null) return null;
  if (state.payload.kind !== "Expr") return null;

  // 2) at LCA: cross Equal if applicable (optional)
  if (tree.nodesById[r.lcaId]?.op === "Equal") {
    const crossed = stepCrossEqual(state);
    if (!crossed) return null;
    state = crossed;
  }

  // 2b) at LCA: if it's a Negate, flip the payload sign when exiting the negated group.
  if (tree.nodesById[r.lcaId]?.op === "Negate") {
    if (state.payload?.kind !== "Expr") return null;
    state = {
      ...state,
      payload: { kind: "Expr", mj: ["Negate", state.payload.mj] },
    };
  }

  // 3) If destination *is* the LCA, try to drop right now
  if (toId === r.lcaId) {
    const dropped = maybeDropHere(tree, state, toId, toId, targetSlot);
    state = dropped.state;

    if (state.payload !== null) return null;
    return ExpressionTree.create(state.root);
  }

  // 4) walk DOWN (edge-aware)
  let currentId = r.lcaId;
  for (const childId of r.down) {
    const out = stepDown({
      tree,
      state,
      currentId,
      childId,
      destId: toId,
      targetSlot,
    });
    if (!out) return null;

    state = out.state;
    if (out.didDrop) break;

    currentId = childId;
  }

  // 5) final drop at destination
  {
    const dropped = maybeDropHere(tree, state, toId, toId, targetSlot);
    state = dropped.state;

    if (state.payload !== null) return null;
    return ExpressionTree.create(state.root);
  }
}

function buildLiftPayloadFromSelectedChildren(
  addExpr: MJNode,
  childIdxs: number[]
): MJ {
  // addExpr = ["Add", ...children]
  // childIdxs are term-space indices: 0..n-1 corresponding to children positions
  const kids = addExpr.slice(1);
  const picked = childIdxs.map((i) => kids[i]);

  if (picked.length === 1) return picked[0];
  return ["Add", ...picked] as MJNode;
}

function rewriteAddRemovingChildren(
  addExpr: MJNode,
  removeIdxs: Set<number>
): MJ {
  const kids = addExpr.slice(1);
  const remain: MJ[] = [];
  for (let i = 0; i < kids.length; i++) {
    if (!removeIdxs.has(i)) remain.push(kids[i]);
  }
  return normalizeAdd(remain, { preserveWrapper: true });
}

export function stepUp(
  tree: ExpressionTree,
  state: State,
  id: string,
  fromChildId?: string
): State | null {
  const op = tree.nodesById[id]?.op;

  // -------------------------
  // 1) Extract from additive / multiplicative containers while carrying Selection
  // -------------------------
  if (state.payload?.kind === "Selection") {
    if (op === "Divide") {
      // Reject lifting when the selection is INSIDE a fraction; allow only if the
      // selected node IS the Divide term itself (handled earlier in applyMove).
      const selectionIds = new Set(state.payload.ids);
      const dividesId = id;
      // If any selected id is not the Divide node itself, bail.
      if (![dividesId].every((x) => selectionIds.has(x))) return null;
      // Otherwise fall through (no-op here); the Divide term will be lifted by an Add ancestor.
      return state;
    }
    if (op !== "Add" && op !== "InvisibleOperator" && op !== "Multiply") {
      return state;
    }

    const selected = state.payload.ids;

    // Require: all selected ids are direct children of this container.
    for (const sid of selected) {
      if (tree.parentById[sid] !== id) return state; // not lift point
    }

    const childIdxs = selected
      .map((sid) => tree.childIndexById[sid])
      .filter((x): x is number => typeof x === "number");
    if (childIdxs.length !== selected.length) return null;

    if (op === "Add") {
      const addId = id;
      const sortedIdxs = [...childIdxs].sort((a, b) => a - b);
      const addPath = tree.pathById[addId];
      if (!addPath) return null;

      const addExpr = getAtPath(state.root, addPath);
      if (!Array.isArray(addExpr) || addExpr[0] !== "Add") return null;

      const nKids = addExpr.length - 1;
      const remove = new Set<number>();
      for (const i of sortedIdxs) {
        if (i < 0 || i >= nKids) return null;
        remove.add(i);
      }

      const payloadMJ = buildLiftPayloadFromSelectedChildren(addExpr as MJNode, [
        ...remove,
      ]);
      const rewrittenAdd = rewriteAddRemovingChildren(addExpr as MJNode, remove);
      const rootAfter = setAtPath(state.root, addPath, rewrittenAdd);

      return { root: rootAfter, payload: { kind: "Expr", mj: payloadMJ } };
    }

    const mulId = id;
    const initialIdxs = selected
      .map((sid) => tree.childIndexById[sid])
      .filter((x): x is number => typeof x === "number");
    if (initialIdxs.length !== selected.length) return null;

    const expandedIdxs = new Set<number>(initialIdxs);

    const mulPath = tree.pathById[mulId];
    if (!mulPath) return null;
    const mulExpr = getAtPath(state.root, mulPath);
    if (
      !Array.isArray(mulExpr) ||
      (mulExpr[0] !== "InvisibleOperator" && mulExpr[0] !== "Multiply")
    ) {
      return null;
    }

    const factors = mulExpr.slice(1) as MJ[];
    const payloadFactors = [...expandedIdxs]
      .sort((a, b) => a - b)
      .map((i) => factors[i])
      .filter((v): v is MJ => v !== undefined);
    if (payloadFactors.length === 0) return null;

    const remainingFactors = factors.filter((_, i) => !expandedIdxs.has(i));
    const payloadMJ = normalizeMul(payloadFactors);
    const rewrittenMul = normalizeMul(remainingFactors);
    const rootAfter = setAtPath(state.root, mulPath, rewrittenMul);

    return { root: rootAfter, payload: { kind: "Expr", mj: payloadMJ } };
  }

  // If we don't have an Expr payload, nothing to carry upward.
  if (state.payload == null || state.payload.kind !== "Expr") return state;

  // -------------------------
  // 2) Flip sign when exiting a Negate wrapper
  // -------------------------
  if (op === "Negate") {
    return {
      ...state,
      payload: { kind: "Expr", mj: ["Negate", state.payload.mj] },
    };
  }

  // -------------------------
  // 3) CARRY through Divide (payload transform only)
  // -------------------------
  if (op === "Divide") {
    // Need direction (numerator vs denominator)
    if (!fromChildId) return null;

    const kids = tree.childrenById[id] ?? [];
    if (kids.length !== 2) return null;
    const [numId, denId] = kids;

    // Only allowed to lift additively through a Divide when coming from numerator
    if (fromChildId !== numId) return null;

    const denPath = tree.pathById[denId];
    if (!denPath) return null;
    const denExpr = getAtPath(state.root, denPath);

    // Wrap the payload in the same denominator: payload := payload / denom
    const nextPayload: MJ = ["Divide", state.payload.mj, denExpr] as MJNode;

    return { ...state, payload: { kind: "Expr", mj: nextPayload } };
  }

  // Carry through grouping wrappers (e.g. \left( ... \right)) without changing payload.
  if (op === "Delimiter") {
    return state;
  }

  // -------------------------
  // 3) Default: no-op for other ops (for now)
  // -------------------------
  return null;
}

function asAddChildren(expr: MJ): MJ[] {
  if (Array.isArray(expr) && expr[0] === "Add") return expr.slice(1);
  return [expr];
}

function buildAdd(children: MJ[]): MJ {
  return normalizeAdd(children);
}

function stripRedundantDelimiterForAddPayload(mj: MJ): MJ {
  if (
    Array.isArray(mj) &&
    mj[0] === "Negate" &&
    Array.isArray(mj[1]) &&
    mj[1][0] === "Delimiter"
  ) {
    const inner = mj[1][1] as MJ;
    if (!Array.isArray(inner) || (inner[0] !== "Add" && inner[0] !== "Equal")) {
      return ["Negate", inner] as MJNode;
    }
  }
  if (Array.isArray(mj) && mj[0] === "Delimiter") {
    const inner = mj[1] as MJ;
    if (!Array.isArray(inner) || (inner[0] !== "Add" && inner[0] !== "Equal")) {
      return inner;
    }
  }
  return mj;
}

export function maybeDropHere(
  tree: ExpressionTree,
  state: State,
  currentId: string,
  destId: string,
  targetSlot: Slot
): { state: State; didDrop: boolean } {
  // Only drop when we're at the destination node.
  if (currentId !== destId) return { state, didDrop: false };

  // Must have an Expr payload to drop.
  if (state.payload == null) return { state, didDrop: false };
  if (state.payload.kind !== "Expr") return { state, didDrop: false };

  const destPath = tree.pathById[destId];
  if (!destPath) return { state, didDrop: false };

  const destExpr = getAtPath(state.root, destPath);
  const slotRaw = typeof targetSlot === "number" ? targetSlot : null;
  const payloadForDrop = stripRedundantDelimiterForAddPayload(state.payload.mj);

  const destIsAdd =
    tree.nodesById[destId]?.op === "Add" ||
    (Array.isArray(destExpr) && destExpr[0] === "Add");

  // -----------------------------------------
  // Case A: destination is (or has become) Add
  // -----------------------------------------
  if (destIsAdd) {
    const kids = asAddChildren(destExpr);

    // Interpret targetSlot as insertion index in term-space
    const insRaw = slotRaw ?? kids.length;
    const ins = Math.max(0, Math.min(kids.length, insRaw));

    const nextKids = [
      ...kids.slice(0, ins),
      payloadForDrop,
      ...kids.slice(ins),
    ];
    const nextAddExpr = buildAdd(nextKids);
    const rootAfter = setAtPath(state.root, destPath, nextAddExpr);

    return { state: { root: rootAfter, payload: null }, didDrop: true };
  }

  // -----------------------------------------
  // Case B: destination is not Add -> wrap into an implicit sum
  //
  // SAFETY:
  // - If dest is inside a non-additive parent (Multiply/Divide/etc), refuse.
  //   This prevents (a + c)b style edits; UI should have chosen the term-root.
  // - If parent is Add, the call site should have targeted the parent Add instead.
  // -----------------------------------------
  const parentId = tree.parentById[destId];
  if (parentId) {
    const pOp = tree.nodesById[parentId]?.op;

    if (pOp === "Add") {
      return { state, didDrop: false };
    }
    if (pOp && pOp !== "Equal") {
      // Not directly under an additive boundary; refuse.
      // (If you later add more additive boundaries, extend this condition.)
      return { state, didDrop: false };
    }
  }

  // For a singleton, only "before" (0) or "after" (1) are meaningful.
  const wrapSlotRaw = slotRaw ?? 1;
  const wrapSlot = wrapSlotRaw <= 0 ? 0 : 1;

  const nextKids =
    wrapSlot === 0
      ? [payloadForDrop, destExpr]
      : [destExpr, payloadForDrop];

  const nextAddExpr = buildAdd(nextKids);
  const rootAfter = setAtPath(state.root, destPath, nextAddExpr);

  return { state: { root: rootAfter, payload: null }, didDrop: true };
}

type StepDownArgs = {
  tree: ExpressionTree;
  state: State;
  currentId: string;
  childId: string; // the child we're stepping into
  destId: string;
  targetSlot: Slot;
};

export function stepDown({
  tree,
  state,
  currentId,
  childId,
  destId,
  targetSlot,
}: StepDownArgs): { state: State; didDrop: boolean } | null {
  // The payload should have been extracted by the LCA. If not, throw. This should never happen.
  if (state.payload?.kind === "Selection") {
    throw new Error(
      "Invariant violation: stepDown called with Selection payload"
    );
  }

  // Already dropped → carry
  if (state.payload == null) return { state, didDrop: false };

  const cur = tree.nodesById[currentId];
  if (!cur) return null;

  // Divide-specific logic
  if (cur.op === "Divide") {
    const kids = tree.childrenById[currentId] ?? [];
    if (kids.length !== 2) return null;

    const [numId, denId] = kids;

    // Denominator forbidden
    if (childId === denId) return null;

    // Numerator allowed: multiply payload by denominator
    if (childId === numId) {
      if (state.payload.kind !== "Expr") return null;

      const denMJ = tree.nodesById[denId]?.json;
      if (!denMJ) return null;

      const isNumericLiteral =
        typeof denMJ === "number" ||
        (Array.isArray(denMJ) &&
          denMJ.length === 2 &&
          denMJ[0] === "Negate" &&
          typeof denMJ[1] === "number");

      const factors = isNumericLiteral
        ? [denMJ, state.payload.mj]
        : [state.payload.mj, denMJ];

      return {
        state: {
          ...state,
          payload: { kind: "Expr", mj: ["InvisibleOperator", ...factors] },
        },
        didDrop: false,
      };
    }
  }

  // Try dropping if we're at the destination
  const dropped = maybeDropHere(tree, state, currentId, destId, targetSlot);
  if (dropped.didDrop) return dropped;

  return { state, didDrop: false };
}
