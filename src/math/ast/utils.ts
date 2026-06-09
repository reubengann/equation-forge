import type { Expr } from "./expr";
import type { CompiledMathDocument } from "../compile/compileMathDocument";

export function cloneExpr(expr: Expr): Expr {
  return structuredClone(expr);
}

/**
 * Immutably replaces a compiled AST node by id.
 *
 * The compiled index tells us exactly where each node sits in its parent
 * (`field` plus optional array `index`), so this does not need to search the
 * tree by reference. Instead, it clones the replacement and then walks upward,
 * cloning each ancestor and swapping in the already-updated child until it
 * reaches the root.
 */
export function replaceCompiledNode(
  document: CompiledMathDocument,
  nodeId: string,
  replacement: Expr,
): Expr | null {
  if (!document.index.nodeById[nodeId]) return null;
  if (nodeId === document.index.rootId) return cloneExpr(replacement);

  let nextChild = cloneExpr(replacement);
  let cursorId = nodeId;

  while (cursorId !== document.index.rootId) {
    const location = document.index.locationById[cursorId];
    if (!location?.parentId || !location.field) return null;

    const parent = document.index.nodeById[location.parentId];
    if (!parent) return null;

    const nextParent = cloneExpr(parent);
    const nextParentRecord = nextParent as Record<string, unknown>;
    const currentFieldValue = nextParentRecord[location.field];

    if (location.index != null) {
      if (!Array.isArray(currentFieldValue)) return null;
      const nextChildren = [...currentFieldValue];
      nextChildren[location.index] = nextChild;
      nextParentRecord[location.field] = nextChildren;
    } else {
      nextParentRecord[location.field] = nextChild;
    }

    nextChild = nextParent;
    cursorId = location.parentId;
  }

  return nextChild;
}
