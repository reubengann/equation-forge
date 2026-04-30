import {
  buildCompiledExprIndex,
  type CompiledExprIndex,
  type Expr,
} from "../ast";
import { exprToLatex } from "../adapters/latex/exprToLatex";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";

export type CompiledMathDocument = {
  sourceLatex: string;
  expr: Expr;
  plainLatex: string;
  taggedLatex: string;
  index: CompiledExprIndex;
};

export function compileMathDocument(sourceLatex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(sourceLatex);
  return compileMathDocumentFromExpr(sourceLatex, expr);
}

export function compileMathDocumentFromExpr(
  sourceLatex: string,
  expr: Expr,
): CompiledMathDocument {
  return {
    sourceLatex,
    expr,
    plainLatex: exprToLatex(expr, false),
    taggedLatex: exprToLatex(expr, true),
    index: buildCompiledExprIndex(expr),
  };
}

export function resolveCompiledNodeId(
  doc: CompiledMathDocument,
  nodeId: string | null,
): string | null {
  if (!nodeId) return null;
  return doc.index.nodeById[nodeId] ? nodeId : null;
}
