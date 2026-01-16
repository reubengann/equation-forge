import type { ExpressionTree } from "../../ExpressionTree";
import type { RectProvider } from "../../domain/move/planMoveGeometry";
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
