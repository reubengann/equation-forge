// import { exprToLatex } from "../../adapters/latex/exprToLatex";
// import { buildCandidateId } from "../engine";
// import { exprFingerprint, replaceAtPath } from "../treeUtils";
import type { RewriteCandidate, RewriteRule } from "../types";

export function canRearrangeTermsInSum(): RewriteRule {
  return {
    id: "canRearrangeTermsInSum",
    getCandidate: (context) => {
      return {};
    },
  };
}

// function unwrapDisplayGroupRule(): RewriteRule {
//   const ruleId = "proof.unwrapDisplayGroup";
//   return {
//     id: ruleId,
//     label: "Unwrap display grouping",
//     getCandidates: (context) => {
//       const selected = context.primarySelected;
//       if (!selected) return [];
//       if (selected.node.kind !== "display_group") return [];
//       const after = selected.node.expression;
//       const candidate: RewriteCandidate = {
//         id: buildCandidateId(ruleId, selected.nodeId, 0),
//         ruleId,
//         label: "Remove redundant delimiters",
//         anchor: {
//           nodeId: selected.nodeId,
//           path: selected.path,
//           fingerprint: exprFingerprint(selected.node),
//         },
//         preview: {
//           sourceNodeIds: [selected.nodeId],
//           beforeLatex: exprToLatex(selected.node, false),
//           afterLatex: exprToLatex(after, false),
//           summary: "unwrap display group",
//         },
//         selectionMapping: {
//           sourceNodeIds: [selected.nodeId],
//           intent: { kind: "single", path: selected.path },
//         },
//         apply: (root) => replaceAtPath(root, selected.path, after),
//       };
//       return [candidate];
//     },
//   };
// }

// function simplifyDoubleNegationRule(): RewriteRule {
//   const ruleId = "proof.simplifyDoubleNegation";
//   return {
//     id: ruleId,
//     label: "Simplify double negation",
//     getCandidates: (context) => {
//       const selected = context.primarySelected;
//       if (!selected) return [];
//       if (selected.node.kind !== "negate" || selected.node.value.kind !== "negate") return [];
//       const after = selected.node.value.value;
//       const candidate: RewriteCandidate = {
//         id: buildCandidateId(ruleId, selected.nodeId, 0),
//         ruleId,
//         label: "Cancel two negatives",
//         anchor: {
//           nodeId: selected.nodeId,
//           path: selected.path,
//           fingerprint: exprFingerprint(selected.node),
//         },
//         preview: {
//           sourceNodeIds: [selected.nodeId],
//           beforeLatex: exprToLatex(selected.node, false),
//           afterLatex: exprToLatex(after, false),
//           summary: "remove negation of negation",
//         },
//         selectionMapping: {
//           sourceNodeIds: [selected.nodeId],
//           intent: { kind: "single", path: selected.path },
//         },
//         apply: (root) => replaceAtPath(root, selected.path, after),
//       };
//       return [candidate];
//     },
//   };
// }

// export function createProofRewriteRules(): RewriteRule[] {
//   return [simplifyDoubleNegationRule(), unwrapDisplayGroupRule()];
// }
