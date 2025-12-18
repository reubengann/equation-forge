import type { Expr } from "./types";
import type { MathNode, OperatorNode, ParenthesisNode, SymbolNode, ConstantNode, FunctionNode } from "mathjs";

function isOp(n: MathNode): n is OperatorNode {
  return n.type === "OperatorNode";
}
function isParens(n: MathNode): n is ParenthesisNode {
  return n.type === "ParenthesisNode";
}
function isSym(n: MathNode): n is SymbolNode {
  return n.type === "SymbolNode";
}
function isConst(n: MathNode): n is ConstantNode {
  return n.type === "ConstantNode";
}
function isFn(n: MathNode): n is FunctionNode {
  return n.type === "FunctionNode";
}

function unwrap(n: MathNode): MathNode {
  let cur = n;
  while (isParens(cur)) cur = cur.content;
  return cur;
}

function needsParensForMul(n: MathNode): boolean {
  n = unwrap(n);
  return isOp(n) && (n.op === "+" || (n.op === "-" && n.args.length === 2));
}
function needsParensForPow(n: MathNode): boolean {
  n = unwrap(n);
  return isOp(n);
}

export function printLatex(expr: Expr): string {
  const n = unwrap(expr as any);

  if (isConst(n)) return String((n as any).value);

  if (isSym(n)) {
    const name = (n as any).name as string;
    // Physics default: italic variables. Later: bold vectors, roman units, etc.
    return name;
  }

  if (isFn(n)) {
    const fn = (n as any).name as string;
    const args = (n as any).args as MathNode[];
    // Minimal function formatting: \sin(x), f(x)
    const fnLatex = ["sin", "cos", "tan", "ln", "log", "exp"].includes(fn)
      ? `\\${fn}`
      : fn;
    return `${fnLatex}\\left(${args.map(a => printLatex(a as any)).join(", ")}\\right)`;
  }

  if (isOp(n)) {
    const args = (n as any).args as MathNode[];

    // Unary minus
    if (n.op === "-" && args.length === 1) {
      const inner = args[0];
      const innerLatex = printLatex(inner as any);
      const wrapped = needsParensForMul(inner) ? `\\left(${innerLatex}\\right)` : innerLatex;
      return `-${wrapped}`;
    }

    // Binary ops
    if (n.op === "+" && args.length >= 2) {
      return args.map(a => printLatex(a as any)).join(" + ");
    }

    if (n.op === "-" && args.length === 2) {
      return `${printLatex(args[0] as any)} - ${printLatex(args[1] as any)}`;
    }

    if (n.op === "*" && args.length >= 2) {
      return args
        .map(a => {
          const s = printLatex(a as any);
          return needsParensForMul(a) ? `\\left(${s}\\right)` : s;
        })
        .join(" \\cdot ");
    }

    if (n.op === "/" && args.length === 2) {
      return `\\frac{${printLatex(args[0] as any)}}{${printLatex(args[1] as any)}}`;
    }

    if (n.op === "^" && args.length === 2) {
      const base = args[0];
      const exp = args[1];
      const baseLatex = printLatex(base as any);
      const baseWrapped = needsParensForPow(base) ? `\\left(${baseLatex}\\right)` : baseLatex;
      return `${baseWrapped}^{${printLatex(exp as any)}}`;
    }

    // Fallback
    return (expr as any).toString();
  }

  return (expr as any).toString();
}
