import { ExpressionTree, type MJ, type MJNode } from "../ExpressionTree";
import {
  computeDestinationIndex,
  getAtPath,
  isStructurallyValidMove,
  reorderAddAtPath,
  routeBetween,
  setAtPath,
} from "../movePath";
import { normalizeSelection } from "../selectionSemantics";
import type { Slot } from "./types";

export function applyMoveOld(args: {
  tree: ExpressionTree;
  selectedIds: string[];
  hoverId: string;
  targetSlot: Slot;
}): ExpressionTree | null {
  const { tree, selectedIds, hoverId, targetSlot } = args;
  if (targetSlot == null) return null;
  // TODO
  if (selectedIds.length !== 1) return null;

  const movedId = normalizeSelection(tree, selectedIds[0]);

  const addId = hoverId;
  if (tree.nodesById[addId]?.op !== "Add") return null;
  if (tree.parentById[movedId] !== addId) return null;

  const ban = isStructurallyValidMove(tree, movedId, addId);
  if (ban) return null;

  const kids = tree.childrenById[addId] ?? [];
  if (kids.length < 2) return tree;

  const fromIndex = tree.childIndexById[movedId];
  if (fromIndex == null) return null;

  let toIndex = computeDestinationIndex(targetSlot, fromIndex);
  toIndex = Math.max(0, Math.min(kids.length - 1, toIndex));
  if (toIndex === fromIndex) return null;

  const addPath = tree.pathById[addId];
  if (!addPath) return null;

  const nextJson = reorderAddAtPath(tree.rootJson, addPath, fromIndex, toIndex);
  return ExpressionTree.create(nextJson);
}

type Payload =
  | { kind: "Selection"; ids: string[] } // only before lift
  | { kind: "Expr"; mj: MJ } // after lift (what we carry)
  | null; // after drop (consumed)

export type State = {
  root: MJ;
  payload:
    | { kind: "Selection"; ids: string[] } // before lift
    | { kind: "Expr"; mj: MJ } // after lift
    | null; // after drop
};

export function applyMove(args: {
  tree: ExpressionTree;
  selectedIds: string[];
  hoverId: string;
  targetSlot: Slot;
}): ExpressionTree | null {
  const { tree, selectedIds, hoverId, targetSlot } = args;
  if (!targetSlot) return null;
  if (selectedIds.length < 1) return null;

  // TODO: Generalize to multiple nodes
  if (selectedIds.length !== 1) return null;

  const fromId = normalizeSelection(tree, selectedIds[0]);
  const toId = hoverId;

  const r = routeBetween(tree, fromId, toId);
  if (!r) return null;

  // Stepwise executor state
  let root: MJ = tree.rootJson;
  let payload: Payload = null;

  // 1) walk UP applying lift rules when we hit an Add container
  for (const id of r.up) {
    // minimal v1: when we see the parent Add of fromId, lift it out
    // (implementation detail: you probably lift when op === "Add" AND id === parent(fromId))
    // root, payload = stepLiftFromAdd(root, payload, ...)
    // if we attempt to lift through unsupported ops, return null
  }

  // 2) at LCA: cross equal
  if (tree.nodesById[r.lcaId]?.op === "Equal") {
    // root, payload = stepCrossEqual(root, payload)
  } else {
    // for v1 test, require crossing Equal
    return null;
  }

  // 3) walk DOWN applying drop rules when we reach destination Add
  for (const id of r.down) {
    const op = tree.nodesById[id]?.op;

    // when id === toId and op === "Add": drop payload into it
    // root, payload = stepDropIntoAdd(root, payload, ...targetSlot)
  }

  if (payload !== null) return null; // must have been consumed

  return ExpressionTree.create(root);
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

  // Normalize shape (not algebra):
  if (remain.length === 0) return 0; // convention: empty sum -> 0
  if (remain.length === 1) return remain[0];
  return ["Add", ...remain] as MJNode;
}

export function stepUp(
  tree: ExpressionTree,
  state: State,
  id: string,
  fromChildId?: string
): State | null {
  const op = tree.nodesById[id]?.op;

  // -------------------------
  // 1) Extract from Add (only while carrying Selection)
  // -------------------------
  if (state.payload?.kind === "Selection") {
    if (op === "Divide") return null; // Reject an *additive* move selection from a quotient itself.
    if (op !== "Add") return state;

    const addId = id;
    const selected = state.payload.ids;

    // Require: all selected ids are direct children of this Add.
    for (const sid of selected) {
      if (tree.parentById[sid] !== addId) return state; // not lift point
    }

    const childIdxs = selected
      .map((sid) => tree.childIndexById[sid])
      .filter((x): x is number => typeof x === "number")
      .sort((a, b) => a - b);
    if (childIdxs.length !== selected.length) return null;

    const addPath = tree.pathById[addId];
    if (!addPath) return null;

    const addExpr = getAtPath(state.root, addPath);
    if (!Array.isArray(addExpr) || addExpr[0] !== "Add") return null;

    const nKids = addExpr.length - 1;
    const remove = new Set<number>();
    for (const i of childIdxs) {
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

  // If we don't have an Expr payload, nothing to carry upward.
  if (state.payload == null || state.payload.kind !== "Expr") return state;

  // -------------------------
  // 2) CARRY through Divide (payload transform only)
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
  if (children.length === 0) return 0;
  if (children.length === 1) return children[0];
  return ["Add", ...children] as MJNode;
}

type StepResult =
  | { ok: true; state: State; didDrop: boolean }
  | { ok: false; state?: State; reason: string };

export function maybeDropHere(
  tree: ExpressionTree,
  state: State,
  currentId: string,
  destId: string,
  targetSlot: Slot
): { state: State; didDrop: boolean } {
  if (currentId !== destId) return { state, didDrop: false };
  if (state.payload == null) return { state, didDrop: false };
  if (state.payload.kind !== "Expr") return { state, didDrop: false };

  // TODO
  // v1: only drop into Add containers
  if (tree.nodesById[destId]?.op !== "Add") return { state, didDrop: false };
  const addPath = tree.pathById[destId];
  if (!addPath) return { state, didDrop: false };
  const addExpr = getAtPath(state.root, addPath);
  const kids = asAddChildren(addExpr);

  // Interpret targetSlot as insertion index in term-space for now
  const insRaw = typeof targetSlot === "number" ? targetSlot : kids.length;
  const ins = Math.max(0, Math.min(kids.length, insRaw));

  const nextKids = [
    ...kids.slice(0, ins),
    state.payload.mj,
    ...kids.slice(ins),
  ];
  const nextAddExpr = buildAdd(nextKids);
  const rootAfter = setAtPath(state.root, addPath, nextAddExpr);

  return { state: { root: rootAfter, payload: null }, didDrop: true };
}
