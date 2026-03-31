import type { ExpressionTree } from "../../ExpressionTree";
import type { RectProvider } from "../../domain/move/planMoveGeometry";
import type { RectLTRB } from "../../rectMath";
import {
  getMathliveShadowRoot,
  queryElementsByNodeIds,
  unionBoundingClientRects,
} from "./mathliveShadow";

export function createRectProvider(
  measureEl: HTMLElement | null,
  tree: ExpressionTree | null
): RectProvider {
  return (nodeId: string) => {
    if (!measureEl || !tree) return null;
    const sr = getMathliveShadowRoot(measureEl);
    if (!sr) return null;

    const els = queryElementsByNodeIds(sr, [nodeId]);
    if (!els.length) return null;

    return unionBoundingClientRects(els);
  };
}

export function snapshotRectsForTree(
  measureEl: HTMLElement | null,
  tree: ExpressionTree | null
): Record<string, RectLTRB> {
  if (!measureEl || !tree) return {};
  const sr = getMathliveShadowRoot(measureEl);
  if (!sr) return {};

  const out: Record<string, RectLTRB> = {};
  for (const nodeId of Object.keys(tree.nodesById)) {
    const els = queryElementsByNodeIds(sr, [nodeId]);
    const rect = unionBoundingClientRects(els);
    if (!rect) continue;
    out[nodeId] = rect;
  }
  return out;
}
