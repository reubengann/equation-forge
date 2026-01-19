import { box, normalizeMathJson } from "./computeEngine";
import { ExpressionTree, type MJ } from "./ExpressionTree";
import { getAtPath, setAtPath } from "./movePath";

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
  const mappedOp = op === "Multiply" ? ("InvisibleOperator" as const) : op;
  return [mappedOp, ...expr.slice(1).map(fromComputeEngine)] as MJ;
}

function isAdd(node: MJ): node is MJ & [string, ...MJ[]] {
  return Array.isArray(node) && node[0] === "Add";
}

function containsOp(expr: MJ, op: string): boolean {
  if (!Array.isArray(expr)) return false;
  if (expr[0] === op) return true;
  return expr.slice(1).some((c) => containsOp(c as MJ, op));
}

function unwrapDelimiter(expr: MJ): MJ {
  if (Array.isArray(expr) && expr[0] === "Delimiter" && expr.length >= 2) {
    return expr[1] as MJ;
  }
  return expr;
}

function distributeDotProduct(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = expr[0];
  const kids = expr.slice(1).map(distributeDotProduct);

  if (op === "DotProduct" && kids.length >= 2) {
    const left = unwrapDelimiter(kids[0]);
    const right = unwrapDelimiter(kids[1]);

    if (isAdd(left)) {
      const leftTerms = left.slice(1) as MJ[];
      return [
        "Add",
        ...leftTerms.map((term: MJ) =>
          distributeDotProduct(["DotProduct", term, right] as MJ)
        ),
      ] as MJ;
    }

    if (isAdd(right)) {
      const rightTerms = right.slice(1) as MJ[];
      return [
        "Add",
        ...rightTerms.map((term: MJ) =>
          distributeDotProduct(["DotProduct", left, term] as MJ)
        ),
      ] as MJ;
    }

    return ["DotProduct", left, right] as MJ;
  }

  return [op, ...kids] as MJ;
}

export function expandSubexpression(
  tree: ExpressionTree,
  targetId: string
): ExpressionTree | null {
  const path = tree.pathById[targetId];
  if (!path) return null;

  const target = getAtPath(tree.rootJson, path) as MJ;

  // Step 1: custom bilinear distribution for DotProduct over Add.
  const distributed = distributeDotProduct(target);

  // Step 2: let the Compute Engine do standard expansion.
  const ceReady = toComputeEngine(distributed);
  const skipCeExpand = containsOp(distributed, "DotProduct");
  const expandedBox = skipCeExpand ? null : box(ceReady)?.expand?.();
  const expanded = expandedBox ? expandedBox.json : ceReady;

  // Step 3: translate back to our dialect and normalize.
  const back = fromComputeEngine(expanded as MJ);
  const normalized = normalizeMathJson(back);
  if (!normalized) return null;

  // If nothing changed, treat as no-op.
  if (deepEqualMJ(normalized, target)) return null;

  const nextRoot = setAtPath(tree.rootJson, path, normalized) as MJ;
  return ExpressionTree.create(nextRoot);
}
