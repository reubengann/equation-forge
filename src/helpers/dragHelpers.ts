// Compatibility shim: re-export moved helpers from their new locations.
export type { RectProvider } from "../domain/move/planMoveGeometry";
export { createRectProvider } from "../infra/mathlive/rectProvider";
export { describeMovePlan, planToApplyMoveTarget } from "../domain/move/movePlanAdapters";
export { renderInsertOverlay } from "../ui/drag/renderInsertOverlay";
