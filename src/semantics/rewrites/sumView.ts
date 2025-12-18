import type { MathNode, OperatorNode } from "mathjs";
import type { Expr } from "../types";
import { math } from "../codec";

type Term = { sign: 1 | -1; node: MathNode };

function isOp(n: MathNode): n is OperatorNode {
  return n.type === "OperatorNode";
}
function isParens(n: any): n is { type: "ParenthesisNode"; content: MathNode } {
  return n?.type === "ParenthesisNode";
}
function unwrap(n: MathNode): MathNode {
  let cur: any = n;
  while (isParens(cur)) cur = cur.content;
  return cur as MathNode;
}

export function toSumTerms(expr: Expr): Term[] {
  const n = unwrap(expr as any);

  if (!isOp(n)) return [{ sign: 1, node: n }];

  const args = (n as any).args as MathNode[];

  // a + b + c
  if (n.op === "+") {
    return args.flatMap(a => toSumTerms(a as any));
  }

  // unary -x
  if (n.op === "-" && args.length === 1) {
    return toSumTerms(args[0] as any).map(t => ({ sign: (t.sign * -1) as 1 | -1, node: t.node }));
  }

  // binary a - b
  if (n.op === "-" && args.length === 2) {
    const left = toSumTerms(args[0] as any);
    const right = toSumTerms(args[1] as any).map(t => ({ sign: (t.sign * -1) as 1 | -1, node: t.node }));
    return [...left, ...right];
  }

  return [{ sign: 1, node: n }];
}

export function fromSumTerms(terms: Term[]): Expr {
  if (terms.length === 0) return math.parse("0");
  if (terms.length === 1) {
    const t = terms[0];
    return t.sign === 1 ? (t.node as any) : math.parse(`-(${t.node.toString()})`);
  }

  // rebuild without reordering
  const parts = terms.map(t => (t.sign === 1 ? t.node.toString() : `-(${t.node.toString()})`));
  return math.parse(parts.join(" + "));
}

export function termKey(n: MathNode): string {
  // v0 structural key: unwrap parens then stringify
  return unwrap(n).toString();
}
