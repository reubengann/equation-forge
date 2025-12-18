import type { Expr } from "../types";
import { fromSumTerms, termKey, toSumTerms } from "./sumView";

export function cancelAdditivePairsOnExpr(expr: Expr): Expr {
  const terms = toSumTerms(expr);

  const used = new Array<boolean>(terms.length).fill(false);

  for (let i = 0; i < terms.length; i++) {
    if (used[i]) continue;

    for (let j = i + 1; j < terms.length; j++) {
      if (used[j]) continue;

      if (termKey(terms[i].node) === termKey(terms[j].node) && terms[i].sign !== terms[j].sign) {
        used[i] = true;
        used[j] = true;
        break;
      }
    }
  }

  const remaining = terms.filter((_, idx) => !used[idx]);
  return fromSumTerms(remaining);
}
