import type { Action, Equation, Expr, Side } from "./types";
import { math } from "./codec";
import { cancelAdditivePairsOnExpr } from "./rewrites/cancel";


function add(a: Expr, b: Expr): Expr {
  return math.parse(`(${a.toString()}) + (${b.toString()})`);
}


function negate(x: Expr): Expr {
  return math.parse(`-(${x.toString()})`);
}

export function applyAction(eq: Equation, action: Action, term?: Expr): Equation {
  switch (action.kind) {
    case "addBothSides": {
      if (!term) return eq;
      return {
        left: add(eq.left, term),
        right: add(eq.right, term),
      };
    }
    case "cancelAdditivePairs": {
      const side: Side = action.side;
      return side === "lhs"
        ? { left: cancelAdditivePairsOnExpr(eq.left), right: eq.right }
        : { left: eq.left, right: cancelAdditivePairsOnExpr(eq.right) };
    }
    case "moveAdditiveToLhs": {
      if (!term) return eq;
      // "Move to LHS" (additive) => add -term to both sides
      let next: Equation = {
        left: add(eq.left, negate(term)),
        right: add(eq.right, negate(term)),
      };

      if (action.autoCancel) {
        next = {
          left: cancelAdditivePairsOnExpr(next.left),
          right: cancelAdditivePairsOnExpr(next.right),
        };
      }
      return next;
    }

    default:
      return eq;
  }
}
