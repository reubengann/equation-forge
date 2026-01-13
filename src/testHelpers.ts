import { ExpressionTree, type MJ } from "./ExpressionTree";
import { ce } from "./computeEngine";

export function makeMJfromLatex(x: string): MJ {
  return ce.parse(x, { canonical: false }).json as MJ;
}

export function treefromLatex(x: string): ExpressionTree {
  return ExpressionTree.create(ce.parse(x, { canonical: false }).json as MJ);
}
/**
 * Helper: find a node id by (op, latex). Keeps tests robust when IDs are generated.
 */
export function findNodeId(
  tree: ExpressionTree,
  pred: (n: any) => boolean
): string {
  const hit = Object.values(tree.nodesById).find(pred);
  if (!hit) {
    throw new Error(
      "Node not found. Existing nodes:\n" +
        Object.values(tree.nodesById)
          .map(
            (n: any) => `${n.id} op=${n.op} latex=${JSON.stringify(n.latex)}`
          )
          .join("\n")
    );
  }
  return hit.id;
}

export function findNodeByLatex(tree: ExpressionTree, latex: string) {
  return findNodeId(tree, (n: any) => n.latex === latex);
}
