/// <reference types="node" />

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildNodeResolutionSource,
  createSelectionControllerState,
  DRAG_COMMIT_THRESHOLD_PX,
  DRAG_PREVIEW_HIT_TEST_PADDING_PX,
  type NodeResolutionSource,
  type SelectionGeometry,
  rectFromPoints,
  resolveNodeAtPoint,
  resolveSelectableNodeAtPoint,
  resolveSelectionFromEvent,
  selectionNodeIds,
} from "../src/interaction/selectionController";
import type { EventFixture } from "../src/interaction/eventFixture";
import { compileMathDocument } from "../src/math/compile/compileMathDocument";
import { canExecuteMove, executeMove } from "../src/math/rewrite/rewriteEngine";
import type { InsertionPreview, MoveType, NodeHorizontalBounds } from "../src/math/rewrite/types";

export const ROOT_DIR = process.cwd();
export const FIXTURE_DIR = path.join(ROOT_DIR, "mathtests", "fixtures");

export async function walkJsonFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkJsonFiles(fullPath);
      results.push(...nested);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      results.push(fullPath);
    }
  }
  return results;
}

export function resolveCandidateFiles(files: string[], rawFilter: string) {
  if (!rawFilter) return files;
  const normalizedFilter = rawFilter.toLowerCase();
  return files.filter((filePath) =>
    path.basename(filePath).toLowerCase().includes(normalizedFilter),
  );
}

export async function parseFixture(filePath: string): Promise<EventFixture> {
  const raw = await readFile(filePath, "utf8");
  const fixture = JSON.parse(raw) as EventFixture;
  if (!fixture || typeof fixture !== "object") {
    throw new Error("Fixture must be an object.");
  }
  if (!Array.isArray(fixture.events)) {
    throw new Error("Fixture must include an events array.");
  }
  if (!fixture.domSnapshots || typeof fixture.domSnapshots !== "object") {
    throw new Error("Fixture must include a domSnapshots object.");
  }
  if (!fixture.expected || typeof fixture.expected !== "object") {
    throw new Error("Fixture must include an expected object.");
  }
  return fixture;
}

export function replayEvents(fixture: EventFixture) {
  const state = {
    selectedNodeIds: [] as string[],
    latex: null as string | null,
    insertionPreview: null as InsertionPreview | null,
    moveType: "additive" as MoveType,
  };
  const replayFailures: string[] = [];
  let currentDomSnapshotId: string | null = null;
  let currentDomSnapshot: SelectionGeometry | null = null;
  let currentCompiledDoc = compileMathDocument(state.latex ?? "");
  let currentCompiledIndex = currentCompiledDoc.index;
  let currentNodeResolution: NodeResolutionSource = buildNodeResolutionSource(
    [],
    currentCompiledIndex,
  );
  let selectionState = createSelectionControllerState();
  let dragStartPointer: { x: number; y: number } | null = null;
  let marqueeStartPointer: { x: number; y: number } | null = null;

  for (const event of fixture.events) {
    switch (event.type) {
      case "latex_accepted":
        const hadCompiledLatex = state.latex != null;
        currentCompiledDoc = compileMathDocument(event.nextLatex ?? "");
        state.latex = currentCompiledDoc.plainLatex;
        currentCompiledIndex = currentCompiledDoc.index;
        if (!hadCompiledLatex && currentDomSnapshot) {
          currentNodeResolution = buildNodeResolutionSource(
            currentDomSnapshot.nodeRects,
            currentCompiledIndex,
          );
        } else {
          currentDomSnapshotId = null;
          currentDomSnapshot = null;
          currentNodeResolution = buildNodeResolutionSource([], currentCompiledIndex);
        }
        state.insertionPreview = null;
        break;
      case "move_mode_changed":
        state.moveType = event.moveType;
        state.insertionPreview = null;
        break;
      case "dom_changed": {
        if (!event.domSnapshotId) {
          currentDomSnapshotId = null;
          currentDomSnapshot = null;
          break;
        }
        const snapshot = fixture.domSnapshots[event.domSnapshotId];
        if (!snapshot) {
          replayFailures.push(
            `${event.type} references missing domSnapshotId=${event.domSnapshotId}`,
          );
          break;
        }
        currentDomSnapshotId = event.domSnapshotId;
        currentDomSnapshot = snapshot;
        if (state.latex == null) {
          break;
        }
        currentNodeResolution = buildNodeResolutionSource(
          currentDomSnapshot.nodeRects,
          currentCompiledIndex,
        );
        break;
      }
      case "pointer_up": {
        if (!currentDomSnapshot) {
          replayFailures.push(
            "pointer_up occurred before dom_changed established current DOM snapshot",
          );
        }
        if (
          event.domSnapshotId &&
          event.domSnapshotId !== currentDomSnapshotId
        ) {
          replayFailures.push(
            `pointer_up domSnapshotId mismatch: event=${event.domSnapshotId} current=${currentDomSnapshotId}`,
          );
        }
        const selection = selectionState.selection;
        if (marqueeStartPointer) {
          const hasDragged =
            Math.hypot(event.pointer.x - marqueeStartPointer.x, event.pointer.y - marqueeStartPointer.y) >=
              DRAG_COMMIT_THRESHOLD_PX;
          const result = resolveSelectionFromEvent({
            event: hasDragged
              ? {
                  type: "marquee_select",
                  marqueeRect: rectFromPoints(marqueeStartPointer, event.pointer),
                }
              : {
                  type: "pointer_up",
                  pointer: { x: event.pointer.x, y: event.pointer.y },
                  ts: event.ts,
                  buttons: event.buttons,
                  ctrlKey: event.ctrlKey ?? false,
                  suppressClickSelectionWhenDragging: false,
                },
            currentSelection: selectionState.selection,
            nodeResolutionSource: currentNodeResolution,
            index: currentCompiledIndex,
            state: selectionState,
          });
          selectionState = result;
          dragStartPointer = null;
          marqueeStartPointer = null;
          state.selectedNodeIds = selectionNodeIds(result.selection);
          state.insertionPreview = null;
          break;
        }
        let previewToApply = state.insertionPreview;
        const hasDragged =
          !!dragStartPointer &&
          Math.hypot(event.pointer.x - dragStartPointer.x, event.pointer.y - dragStartPointer.y) >=
            DRAG_COMMIT_THRESHOLD_PX;
        if (event.ctrlKey || !hasDragged) {
          previewToApply = null;
        } else if (selection) {
          const destinationId = resolveSelectableNodeAtPoint(
            { x: event.pointer.x, y: event.pointer.y },
            currentNodeResolution,
            currentCompiledIndex,
            DRAG_PREVIEW_HIT_TEST_PADDING_PX,
          );
          if (!destinationId || selectionNodeIds(selection).includes(destinationId)) {
            previewToApply = null;
          } else {
            const rectById: Record<string, NodeHorizontalBounds> = {};
            for (const [nodeId, rect] of Object.entries(currentNodeResolution.rectById)) {
              rectById[nodeId] = { left: rect.left, right: rect.right };
            }
            previewToApply = canExecuteMove({
              document: currentCompiledDoc,
              selection,
              destinationId,
              moveType: state.moveType,
              pointerX: event.pointer.x,
              rectById,
            });
          }
        }
        let nextLatex: string | null = null;
        if (selection && previewToApply) {
          const moveResult = executeMove({
            document: currentCompiledDoc,
            selection,
            destinationId: previewToApply.destinationId,
            moveType: state.moveType,
            destinationSlot: previewToApply.destinationSlot,
          });
          nextLatex = moveResult?.latex ?? null;
        }

        const result = resolveSelectionFromEvent({
          event: {
            type: "pointer_up",
            pointer: { x: event.pointer.x, y: event.pointer.y },
            ts: event.ts,
            buttons: event.buttons,
            ctrlKey: event.ctrlKey ?? false,
            suppressClickSelectionWhenDragging: !!selection,
          },
          currentSelection: selectionState.selection,
          nodeResolutionSource: currentNodeResolution,
          index: currentCompiledIndex,
          state: selectionState,
        });
        selectionState = result;
        dragStartPointer = null;
        marqueeStartPointer = null;
        state.selectedNodeIds = selectionNodeIds(result.selection);
        state.insertionPreview = null;
        if (nextLatex != null) {
          state.latex = nextLatex;
          selectionState = {
            ...selectionState,
            selection: null,
            pendingPointerDown: null,
            suppressSelectionOnNextPointerUp: false,
          };
          state.selectedNodeIds = [];
          currentCompiledDoc = compileMathDocument(state.latex);
          currentCompiledIndex = currentCompiledDoc.index;
          currentDomSnapshotId = null;
          currentDomSnapshot = null;
          currentNodeResolution = buildNodeResolutionSource([], currentCompiledIndex);
        }
        break;
      }
      case "pointer_move": {
        if (!currentDomSnapshot) {
          replayFailures.push(
            "pointer_move occurred before dom_changed established current DOM snapshot",
          );
        }
        if (
          event.domSnapshotId &&
          event.domSnapshotId !== currentDomSnapshotId
        ) {
          replayFailures.push(
            `pointer_move domSnapshotId mismatch: event=${event.domSnapshotId} current=${currentDomSnapshotId}`,
          );
        }

        const selection = selectionState.selection;
        if (marqueeStartPointer) {
          state.insertionPreview = null;
          break;
        }
        if (!selection) {
          state.insertionPreview = null;
          break;
        }

        const destinationId = resolveSelectableNodeAtPoint(
          { x: event.pointer.x, y: event.pointer.y },
          currentNodeResolution,
          currentCompiledIndex,
          DRAG_PREVIEW_HIT_TEST_PADDING_PX,
        );
        if (!destinationId || selectionNodeIds(selection).includes(destinationId)) {
          state.insertionPreview = null;
          break;
        }

        const rectById: Record<string, NodeHorizontalBounds> = {};
        for (const [nodeId, rect] of Object.entries(currentNodeResolution.rectById)) {
          rectById[nodeId] = { left: rect.left, right: rect.right };
        }
        state.insertionPreview = canExecuteMove({
          document: currentCompiledDoc,
          selection,
          destinationId,
          moveType: state.moveType,
          pointerX: event.pointer.x,
          rectById,
        });
        break;
      }
      case "pointer_down": {
        dragStartPointer = { x: event.pointer.x, y: event.pointer.y };
        marqueeStartPointer = null;
        if (!currentDomSnapshot) {
          replayFailures.push(
            "pointer_down occurred before dom_changed established current DOM snapshot",
          );
        }
        if (
          event.domSnapshotId &&
          event.domSnapshotId !== currentDomSnapshotId
        ) {
          replayFailures.push(
            `pointer_down domSnapshotId mismatch: event=${event.domSnapshotId} current=${currentDomSnapshotId}`,
          );
        }
        const hit = resolveNodeAtPoint(
          { x: event.pointer.x, y: event.pointer.y },
          currentNodeResolution,
          currentCompiledIndex,
        );
        if (!hit.treeHitNodeId && !(event.ctrlKey ?? false)) {
          marqueeStartPointer = { x: event.pointer.x, y: event.pointer.y };
          state.insertionPreview = null;
          break;
        }

        const result = resolveSelectionFromEvent({
          event: {
            type: "pointer_down",
            pointer: { x: event.pointer.x, y: event.pointer.y },
            ts: event.ts,
            buttons: event.buttons,
            ctrlKey: event.ctrlKey ?? false,
          },
          currentSelection: selectionState.selection,
          nodeResolutionSource: currentNodeResolution,
          index: currentCompiledIndex,
          state: selectionState,
        });
        selectionState = result;
        state.selectedNodeIds = selectionNodeIds(result.selection);
        state.insertionPreview = null;
        break;
      }
      default:
        break;
    }
  }

  return { state, replayFailures };
}

export function buildAssertions(
  fixture: EventFixture,
  replayResult: ReturnType<typeof replayEvents>,
) {
  const failures: string[] = [];
  failures.push(...replayResult.replayFailures);
  const expected = fixture.expected ?? {};
  const finalState = replayResult.state;

  if ("selectedNodeIds" in expected) {
    if (
      JSON.stringify(finalState.selectedNodeIds) !==
      JSON.stringify(expected.selectedNodeIds)
    ) {
      failures.push(
        `selectedNodeIds expected=${JSON.stringify(expected.selectedNodeIds)} actual=${JSON.stringify(finalState.selectedNodeIds)}`,
      );
    }
  }
  if ("selectedNodeId" in expected) {
    const firstSelected = finalState.selectedNodeIds[0] ?? null;
    if (firstSelected !== expected.selectedNodeId) {
      failures.push(
        `selectedNodeId expected=${JSON.stringify(expected.selectedNodeId)} actual=${JSON.stringify(firstSelected)}`,
      );
    }
  }

  if ("latex" in expected) {
    if (finalState.latex !== expected.latex) {
      failures.push(
        `latex expected=${JSON.stringify(expected.latex)} actual=${JSON.stringify(finalState.latex)}`,
      );
    }
  }

  if ("insertionPreview" in expected) {
    if (
      JSON.stringify(finalState.insertionPreview) !==
      JSON.stringify(expected.insertionPreview)
    ) {
      failures.push(
        `insertionPreview expected=${JSON.stringify(expected.insertionPreview)} actual=${JSON.stringify(finalState.insertionPreview)}`,
      );
    }
  }

  if ("moveType" in expected) {
    if (finalState.moveType !== expected.moveType) {
      failures.push(
        `moveType expected=${JSON.stringify(expected.moveType)} actual=${JSON.stringify(finalState.moveType)}`,
      );
    }
  }

  return failures;
}
