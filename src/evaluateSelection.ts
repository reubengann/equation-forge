import { box, normalizeMathJson } from "./computeEngine";
import { ExpressionTree, type MJ } from "./ExpressionTree";
import { getAtPath, setAtPath } from "./movePath";
import type { ExprSelection } from "./selectionSemantics";

function deepEqualMJ(a: MJ, b: MJ): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualMJ(a[i], b[i])) return false;
    }
    return true;
  }
  return a === b;
}

function toComputeEngine(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const mappedOp = op === "InvisibleOperator" ? ("Multiply" as const) : op;
  return [mappedOp, ...expr.slice(1).map(toComputeEngine)] as MJ;
}

function fromComputeEngine(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  if (op === "Rational") {
    const num = fromComputeEngine(expr[1] as MJ);
    const den = fromComputeEngine(expr[2] as MJ);
    return ["Divide", num, den] as MJ;
  }
  const mappedOp = op === "Multiply" ? ("InvisibleOperator" as const) : op;
  return [mappedOp, ...expr.slice(1).map(fromComputeEngine)] as MJ;
}

function rebuildGrouped(op: "Add" | "InvisibleOperator", parts: MJ[]): MJ {
  if (parts.length === 0) return op === "Add" ? 0 : 1;
  if (parts.length === 1) return parts[0];
  return [op, ...parts] as MJ;
}

function evaluateExpression(expr: MJ): MJ | null {
  const ceReady = toComputeEngine(expr);
  const candidates = [
    box(ceReady)?.simplify?.(),
    box(ceReady)?.evaluate?.(),
    box(ceReady)?.N?.(),
  ].filter(Boolean) as { json: MJ }[];

  for (const cand of candidates) {
    const back = normalizeMathJson(fromComputeEngine(cand.json)) ?? fromComputeEngine(cand.json);
    if (!deepEqualMJ(back, expr)) {
      return back;
    }
  }

  const multiplied = multiplyNumericFactors(expr);
  if (multiplied && !deepEqualMJ(multiplied, expr)) {
    return multiplied;
  }

  return null;
}

function multiplyNumericFactors(expr: MJ): MJ | null {
  if (!Array.isArray(expr)) return null;
  if (expr[0] !== "InvisibleOperator") return null;
  const factors = expr.slice(1) as MJ[];
  let product = 1;
  let numericCount = 0;
  const rest: MJ[] = [];
  for (const f of factors) {
    const numeric =
      typeof f === "number"
        ? f
        : typeof f === "string" && /^-?\d+(?:\.\d+)?$/.test(f)
        ? Number(f)
        : null;
    if (numeric === null) {
      rest.push(f);
      continue;
    }
    numericCount += 1;
    product *= numeric;
  }
  if (numericCount === 0) return null;
  const rebuilt = product === 1 && rest.length > 0 ? rest : [product, ...rest];
  return rebuildGrouped("InvisibleOperator", rebuilt);
}

export function canEvaluateSelection(
  tree: ExpressionTree | null,
  sel: ExprSelection | null
): boolean {
  if (!tree || !sel) return false;
  if (sel.kind === "multi") return false;
  if (sel.kind === "span") {
    const parent = tree.nodesById[sel.parentId];
    if (!parent) return false;
    return parent.op === "Add" || parent.op === "InvisibleOperator";
  }
  return true;
}

export function evaluateSelection(
  tree: ExpressionTree,
  sel: ExprSelection
): ExpressionTree | null {
  if (sel.kind === "multi") return null;

  if (sel.kind === "node") {
    const path = tree.pathById[sel.nodeId];
    if (!path) return null;
    const target = getAtPath(tree.rootJson, path) as MJ;
    const evaluated = evaluateExpression(target);
    if (!evaluated) return null;
    const nextRoot = setAtPath(tree.rootJson, path, evaluated) as MJ;
    return ExpressionTree.create(nextRoot);
  }

  // Span selection
  const parentPath = tree.pathById[sel.parentId];
  if (!parentPath) return null;

  const parentNode = getAtPath(tree.rootJson, parentPath) as MJ;
  if (!Array.isArray(parentNode)) return null;
  const op = parentNode[0];
  if (op !== "Add" && op !== "InvisibleOperator") return null;

  const kids = parentNode.slice(1) as MJ[];
  if (kids.length === 0) return null;

  const { start, end } = sel;
  if (start < 0 || end >= kids.length || start > end) return null;

  const segmentKids = kids.slice(start, end + 1);
  const segmentExpr = rebuildGrouped(op, segmentKids);

  const evaluatedSegment = evaluateExpression(segmentExpr);
  if (!evaluatedSegment) return null;

  const nextKids = [
    ...kids.slice(0, start),
    evaluatedSegment,
    ...kids.slice(end + 1),
  ];

  const rebuiltParent = rebuildGrouped(op, nextKids);
  const nextRoot = setAtPath(tree.rootJson, parentPath, rebuiltParent) as MJ;
  return ExpressionTree.create(nextRoot);
}
