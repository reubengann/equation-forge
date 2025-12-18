import { create, all } from "mathjs";
import type { Expr, Equation } from "./types";

export const math = create(all, {});

/**
 * v0 parse strategy:
 * - MathLive gives us LaTeX.
 * - We keep this simple: treat LaTeX as “math-ish text” and parse via math.js.
 *
 * In practice you’ll likely use MathLive’s ascii-math export as the input to this
 * function. The UI can do that; codec stays stable.
 */
export function parseExprFromAsciiMath(ascii: string): Expr {
  // normalize very lightly (implicit multiplication etc can come later)
  const s = ascii.trim();
  return math.parse(s);
}

export function parseEquationFromAsciiMath(lhsAscii: string, rhsAscii: string): Equation {
  return { left: parseExprFromAsciiMath(lhsAscii), right: parseExprFromAsciiMath(rhsAscii) };
}
