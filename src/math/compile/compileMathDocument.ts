import { buildCompiledExprIndex, type CompiledExprIndex, type Expr } from "../ast";
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

export function compileMathDocumentFromExpr(sourceLatex: string, expr: Expr): CompiledMathDocument {
  return {
    sourceLatex,
    expr,
    plainLatex: exprToLatex(expr, false),
    taggedLatex: exprToLatex(expr, true),
    index: buildCompiledExprIndex(expr),
  };
}

export function resolveCompiledNodeId(doc: CompiledMathDocument, nodeId: string | null): string | null {
  if (!nodeId) return null;
  return doc.index.nodeById[nodeId] ? nodeId : null;
}

function summarizeExpr(expr: Expr): string {
  switch (expr.kind) {
    case "number":
      return `value=${String(expr.value)}`;
    case "symbol":
      return `name=${expr.name}`;
    case "text":
      return `text=${JSON.stringify(expr.text)}`;
    case "inequality":
      return `operator=${expr.operator}`;
    case "root":
      return `degree=${expr.degree}`;
    case "call":
      return `delimiter=${expr.delimiter}`;
    case "dotted_expr":
      return `order=${expr.order}`;
    case "primed":
      return `order=${expr.order}${expr.name ? `, name=${expr.name}` : ""}`;
    case "special_font":
      return `font=${expr.font}`;
    case "multiple_integral":
      return `order=${expr.order}`;
    case "second_order_partial_derivative":
      return `degree=${expr.degree}`;
    case "immutable_expression":
    case "invalid_input":
      return `latex=${JSON.stringify(expr.latex)}`;
    default:
      return "";
  }
}

export function printTree(doc: CompiledMathDocument): void {
  const { rootId, nodeById, childrenById } = doc.index;

  const walk = (nodeId: string, depth: number): void => {
    const expr = nodeById[nodeId];
    if (!expr) {
      console.log(`${"  ".repeat(depth)}- ${nodeId} <missing>`);
      return;
    }

    const summary = summarizeExpr(expr);
    const summarySuffix = summary ? ` (${summary})` : "";
    console.log(`${"  ".repeat(depth)}- ${nodeId} ${expr.kind}${summarySuffix}`);

    const childIds = childrenById[nodeId] ?? [];
    for (const childId of childIds) {
      walk(childId, depth + 1);
    }
  };

  walk(rootId, 0);
}
