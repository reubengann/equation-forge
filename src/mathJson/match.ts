import type { MJ, MJNode } from "../ExpressionTree";

function isMJNode(value: MJ): value is MJNode {
  return Array.isArray(value);
}

export function deepEqualMJ(a: MJ, b: MJ): boolean {
  if (isMJNode(a) && isMJNode(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualMJ(a[i] as MJ, b[i] as MJ)) return false;
    }
    return true;
  }
  return a === b;
}

function unwrapDelimiter(expr: MJ): MJ {
  if (isMJNode(expr) && expr[0] === "Delimiter" && expr.length >= 2) {
    return unwrapDelimiter(expr[1] as MJ);
  }
  return expr;
}

function simplifyNegate(expr: MJ): MJ {
  if (!isMJNode(expr) || expr[0] !== "Negate" || expr.length < 2) return expr;
  const inner = simplifyMatch(expr[1] as MJ);
  if (isMJNode(inner) && inner[0] === "Negate" && inner.length >= 2) {
    return simplifyMatch(inner[1] as MJ);
  }
  return ["Negate", inner];
}

function simplifySum(expr: MJ): MJ {
  if (!isMJNode(expr)) return expr;
  const op = expr[0];
  if (op !== "Add") return expr;

  const terms = expr
    .slice(1)
    .map((c) => simplifyMatch(c as MJ))
    .filter((c) => !(typeof c === "number" && c === 0));

  if (terms.length === 0) return 0;
  if (terms.length === 1) return terms[0] as MJ;
  return [op, ...terms] as MJ;
}

function simplifyProduct(expr: MJ): MJ {
  if (!isMJNode(expr)) return expr;
  const op = expr[0];
  if (op !== "Multiply" && op !== "InvisibleOperator") return expr;

  const factors = expr
    .slice(1)
    .map((c) => simplifyMatch(c as MJ))
    .filter((c) => !(typeof c === "number" && c === 1));

  if (factors.length === 0) return 1;
  if (factors.length === 1) return factors[0] as MJ;
  return [op, ...factors] as MJ;
}

export function simplifyMatch(expr: MJ): MJ {
  const unwrapped = unwrapDelimiter(expr);
  if (!isMJNode(unwrapped)) return unwrapped;

  const op = unwrapped[0];
  if (op === "Negate") return simplifyNegate(unwrapped);
  if (op === "Add") return simplifySum(unwrapped);
  if (op === "Multiply" || op === "InvisibleOperator")
    return simplifyProduct(unwrapped);

  const kids = unwrapped
    .slice(1)
    .map((c) => simplifyMatch(c as MJ)) as MJ[];
  return [op, ...kids] as MJ;
}

export function canonicalizeForMatch(mj: MJ): MJ {
  return simplifyMatch(mj);
}

export function lhsMatchesSelected(lhs: MJ, selected: MJ): boolean {
  const lhsCanon = canonicalizeForMatch(lhs);
  const selCanon = canonicalizeForMatch(selected);
  return deepEqualMJ(lhsCanon, selCanon);
}
