import type { TermSelection } from "../../selection/types";
import type { CompiledMathDocument } from "../compile/compileMathDocument";
// import { exprFingerprint, getNodeAtPath, pathFromNodeId } from "./treeUtils";
import type {
  //   ApplyRewriteCandidateResult,
  //   RewriteCandidate,
  RewriteCandidateQueryResult,
  //   RewriteContext,
  //   RewriteContextResult,
  RewriteRule,
  //   RewriteSelection,
} from "./types";

// function numericNodeSort(nodeIdA: string, nodeIdB: string): number {
//   const matchA = /^n(\d+)$/.exec(nodeIdA);
//   const matchB = /^n(\d+)$/.exec(nodeIdB);
//   if (!matchA || !matchB) return nodeIdA.localeCompare(nodeIdB);
//   return Number(matchA[1]) - Number(matchB[1]);
// }

// function selectedNodeIds(selection: RewriteSelection): string[] {
//   if (selection.kind === "single") return [selection.nodeId];
//   return Array.from(new Set(selection.nodeIds)).sort(numericNodeSort);
// }

// function arraysEqual(left: number[], right: number[]): boolean {
//   if (left.length !== right.length) return false;
//   for (let i = 0; i < left.length; i += 1) {
//     if (left[i] !== right[i]) return false;
//   }
//   return true;
// }

// export function createRewriteContext(
//   document: CompiledMathDocument,
//   selection: RewriteSelection | null,
// ): RewriteContextResult {
//   if (!selection) {
//     return { ok: false, reason: "no_selection" };
//   }

//   if (selection.kind === "multi" && selection.nodeIds.length === 0) {
//     return { ok: false, reason: "invalid_selection" };
//   }

//   const ids = selectedNodeIds(selection);
//   for (const nodeId of ids) {
//     if (!document.index.nodeById[nodeId]) return { ok: false, reason: "invalid_selection" };
//   }

//   if (selection.kind === "multi" && selection.containerNodeId && !document.index.nodeById[selection.containerNodeId]) {
//     return { ok: false, reason: "invalid_selection" };
//   }

//   const selected = ids
//     .map((nodeId) => {
//       const path = pathFromNodeId(document.index, nodeId);
//       if (!path) return null;
//       return {
//         nodeId,
//         node: document.index.nodeById[nodeId],
//         path,
//       };
//     })
//     .filter((item): item is NonNullable<typeof item> => item !== null);

//   if (selected.length !== ids.length) {
//     return { ok: false, reason: "invalid_selection" };
//   }

//   const context: RewriteContext = {
//     document,
//     root: document.expr,
//     index: document.index,
//     selection,
//     selected,
//     primarySelected: selected[0] ?? null,
//   };

//   return { ok: true, context };
// }

// export function buildCandidateId(ruleId: string, anchorNodeId: string, ordinal: number): string {
//   return `${ruleId}::${anchorNodeId}::${ordinal}`;
// }

const REWRITE_RULES = [];

// Main entry point for checking if a move is valid.
export function getRewriteCandidate(
  document: CompiledMathDocument,
  selection: TermSelection,
  moveMethod: "additive" | "multiplicative",
  destinationId: string,
): RewriteCandidateQueryResult {
  return getRewriteCandidatesWithRules(document, selection, moveMethod, destinationId, REWRITE_RULES);
}

function getRewriteCandidatesWithRules(
  document: CompiledMathDocument,
  selection: TermSelection,
  moveMethod: "additive" | "multiplicative",
  destinationId: string,
  rules: RewriteRule[],
): RewriteCandidateQueryResult {
  return {
    ok: false,
    reason: "no_candidates",
  };
  // const contextResult = createRewriteContext(document, selection);
  // if (!contextResult.ok) return contextResult;
  // const context = contextResult.context;
  // const candidates = rules
  //   .flatMap((rule) => rule.getCandidates(context))
  //   .sort((left, right) => {
  //     if (left.ruleId !== right.ruleId) return left.ruleId.localeCompare(right.ruleId);
  //     if (left.label !== right.label) return left.label.localeCompare(right.label);
  //     return left.id.localeCompare(right.id);
  //   });
  // return {
  //   ok: true,
  //   candidates,
  //   context,
  // };
}

// export function applyRewriteCandidate(
//   document: CompiledMathDocument,
//   candidate: RewriteCandidate,
// ): ApplyRewriteCandidateResult {
//   const currentAtAnchor = getNodeAtPath(document.expr, candidate.anchor.path);
//   if (!currentAtAnchor) {
//     return { ok: false, reason: "stale_candidate" };
//   }

//   if (exprFingerprint(currentAtAnchor) !== candidate.anchor.fingerprint) {
//     return { ok: false, reason: "stale_candidate" };
//   }

//   const livePath = pathFromNodeId(document.index, candidate.anchor.nodeId);
//   if (!livePath || !arraysEqual(livePath, candidate.anchor.path)) {
//     return { ok: false, reason: "stale_candidate" };
//   }

//   return {
//     ok: true,
//     nextExpr: candidate.apply(document.expr),
//     selectionMapping: candidate.selectionMapping,
//     candidate,
//   };
// }
