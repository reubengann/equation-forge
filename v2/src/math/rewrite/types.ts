import type { TermSelection } from "../../selection/types";
import type { CompiledMathDocument } from "../compile/compileMathDocument";

// export type RewriteSelection =
//   | { kind: "single"; nodeId: string }
//   | { kind: "multi"; nodeIds: string[]; containerNodeId: string | null };

// export type SelectionIntent =
//   | { kind: "none" }
//   | { kind: "single"; path: number[] }
//   | { kind: "multi"; paths: number[][]; containerPath: number[] | null };

// export type SelectionMapping = {
//   sourceNodeIds: string[];
//   intent: SelectionIntent;
// };

// export type PreviewModel = {
//   sourceNodeIds: string[];
//   beforeLatex: string;
//   afterLatex: string;
//   summary: string;
// };

// export type RewriteMatchAnchor = {
//   nodeId: string;
//   path: number[];
//   fingerprint: string;
// };

// export type RewriteContextNode = {
//   nodeId: string;
//   node: Expr;
//   path: number[];
// };

export type RewriteContext = {
  document: CompiledMathDocument;
  selection: TermSelection;
  destinationId: string;
};

export type RewriteCandidate = {
  //   id: string;
  //   ruleId: string;
  //   label: string;
  //   anchor: RewriteMatchAnchor;
  //   preview: PreviewModel;
  //   selectionMapping: SelectionMapping;
  //   apply: (root: Expr) => Expr;
};

export type RewriteRule = {
  id: string;
  getCandidate: (context: RewriteContext) => RewriteCandidate;
};

// export type RewriteFailureReason = "no_selection" | "invalid_selection" | "stale_candidate";

// export type RewriteContextResult =
//   | { ok: true; context: RewriteContext }
//   | { ok: false; reason: "no_selection" | "invalid_selection" };

export type RewriteCandidateQueryResult =
  | { ok: true; candidate: RewriteCandidate }
  | { ok: false; reason: "no_candidates" };

// export type ApplyRewriteCandidateResult =
//   | {
//       ok: true;
//       nextExpr: Expr;
//       selectionMapping: SelectionMapping;
//       candidate: RewriteCandidate;
//     }
//   | { ok: false; reason: RewriteFailureReason };
