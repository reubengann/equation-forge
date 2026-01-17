import type { MJ } from "./ExpressionTree";

function isEqualNode(node: MJ): boolean {
  return Array.isArray(node) && node[0] === "Equal";
}

export function isFlippableEquation(mj: MJ): boolean {
  return (
    Array.isArray(mj) &&
    mj[0] === "Equal" &&
    mj.length === 3 &&
    !isEqualNode(mj[1]) &&
    !isEqualNode(mj[2])
  );
}

/**
 * Swap the left/right sides of a top-level equation.
 * Returns null when the MathJSON root is not exactly ["Equal", lhs, rhs].
 */
export function flipEquation(mj: MJ): MJ | null {
  if (!isFlippableEquation(mj)) return null;

  const [, lhs, rhs] = mj as [string, MJ, MJ];
  return ["Equal", rhs as MJ, lhs as MJ];
}
