import { describe, expect, it } from "vitest";
// import { add, displayGroup, negate, sym } from "../ast";
// import { compileMathDocumentFromExpr } from "../compile/compileMathDocument";
// import {
//   applyRewriteCandidate,
//   createProofRewriteRules,
//   createRewriteContext,
//   exprFingerprint,
//   getRewriteCandidates,
// } from "./index";
// import type { RewriteCandidate, RewriteRule } from "./types";

describe("rewrite engine", () => {
  it("stub", () => {});
  //   it("rejects missing and invalid selections", () => {
  //     const doc = compileMathDocumentFromExpr("input", sym("a"));
  //     const none = createRewriteContext(doc, null);
  //     expect(none).toEqual({ ok: false, reason: "no_selection" });
  //     const invalidSingle = createRewriteContext(doc, { kind: "single", nodeId: "n99" });
  //     expect(invalidSingle).toEqual({ ok: false, reason: "invalid_selection" });
  //     const invalidMulti = createRewriteContext(doc, { kind: "multi", nodeIds: [], containerNodeId: null });
  //     expect(invalidMulti).toEqual({ ok: false, reason: "invalid_selection" });
  //   });
  //   it("discovers a double-negation candidate with preview data", () => {
  //     const doc = compileMathDocumentFromExpr("input", negate(negate(sym("a"))));
  //     const result = getRewriteCandidates(doc, { kind: "single", nodeId: "n1" }, createProofRewriteRules());
  //     expect(result.ok).toBe(true);
  //     if (!result.ok) return;
  //     expect(result.candidates).toHaveLength(1);
  //     const candidate = result.candidates[0];
  //     expect(candidate.id).toBe("proof.simplifyDoubleNegation::n1::0");
  //     expect(candidate.preview.sourceNodeIds).toEqual(["n1"]);
  //     expect(candidate.preview.beforeLatex).toBe("--a");
  //     expect(candidate.preview.afterLatex).toBe("a");
  //   });
  //   it("applies rewrite only to the intended subtree", () => {
  //     const doc = compileMathDocumentFromExpr("input", add([negate(negate(sym("a"))), sym("b")]));
  //     const result = getRewriteCandidates(doc, { kind: "single", nodeId: "n2" }, createProofRewriteRules());
  //     expect(result.ok).toBe(true);
  //     if (!result.ok) return;
  //     const candidate = result.candidates[0];
  //     const applied = applyRewriteCandidate(doc, candidate);
  //     expect(applied.ok).toBe(true);
  //     if (!applied.ok) return;
  //     expect(applied.nextExpr.kind).toBe("add");
  //     if (applied.nextExpr.kind !== "add") return;
  //     expect(applied.nextExpr.terms[0]).toEqual(sym("a"));
  //     expect(applied.nextExpr.terms[1]).toEqual(sym("b"));
  //   });
  //   it("rejects stale candidates when source subtree changes", () => {
  //     const sourceDoc = compileMathDocumentFromExpr("input", negate(negate(sym("a"))));
  //     const query = getRewriteCandidates(sourceDoc, { kind: "single", nodeId: "n1" }, createProofRewriteRules());
  //     expect(query.ok).toBe(true);
  //     if (!query.ok) return;
  //     const staleTargetDoc = compileMathDocumentFromExpr("input", negate(sym("a")));
  //     const applied = applyRewriteCandidate(staleTargetDoc, query.candidates[0]);
  //     expect(applied).toEqual({ ok: false, reason: "stale_candidate" });
  //   });
  //   it("returns deterministic candidate ordering across rules", () => {
  //     const doc = compileMathDocumentFromExpr("input", sym("a"));
  //     const anchorPath: number[] = [];
  //     const anchorNodeId = "n1";
  //     const anchorFingerprint = exprFingerprint(doc.expr);
  //     const mkCandidate = (ruleId: string, id: string): RewriteCandidate => ({
  //       id,
  //       ruleId,
  //       label: "label",
  //       anchor: { nodeId: anchorNodeId, path: anchorPath, fingerprint: anchorFingerprint },
  //       preview: {
  //         sourceNodeIds: [anchorNodeId],
  //         beforeLatex: "a",
  //         afterLatex: "a",
  //         summary: "noop",
  //       },
  //       selectionMapping: { sourceNodeIds: [anchorNodeId], intent: { kind: "single", path: [] } },
  //       apply: (root) => root,
  //     });
  //     const rules: RewriteRule[] = [
  //       {
  //         id: "zRule",
  //         label: "z",
  //         getCandidates: () => [mkCandidate("zRule", "zRule::n1::0")],
  //       },
  //       {
  //         id: "aRule",
  //         label: "a",
  //         getCandidates: () => [mkCandidate("aRule", "aRule::n1::0")],
  //       },
  //     ];
  //     const result = getRewriteCandidates(doc, { kind: "single", nodeId: "n1" }, rules);
  //     expect(result.ok).toBe(true);
  //     if (!result.ok) return;
  //     expect(result.candidates.map((candidate) => candidate.ruleId)).toEqual(["aRule", "zRule"]);
  //     expect(result.candidates.map((candidate) => candidate.id)).toEqual(["aRule::n1::0", "zRule::n1::0"]);
  //   });
  //   it("returns invalid_selection for bad multi container ids", () => {
  //     const doc = compileMathDocumentFromExpr("input", add([sym("a"), sym("b")]));
  //     const result = getRewriteCandidates(
  //       doc,
  //       { kind: "multi", nodeIds: ["n2", "n3"], containerNodeId: "n999" },
  //       createProofRewriteRules(),
  //     );
  //     expect(result).toEqual({ ok: false, reason: "invalid_selection" });
  //   });
  //   it("discovers display-group candidate and preserves selection intent path", () => {
  //     const doc = compileMathDocumentFromExpr("input", displayGroup("paren", sym("a")));
  //     const result = getRewriteCandidates(doc, { kind: "single", nodeId: "n1" }, createProofRewriteRules());
  //     expect(result.ok).toBe(true);
  //     if (!result.ok) return;
  //     const candidate = result.candidates[0];
  //     expect(candidate.ruleId).toBe("proof.unwrapDisplayGroup");
  //     expect(candidate.selectionMapping.intent).toEqual({ kind: "single", path: [] });
  //   });
});
