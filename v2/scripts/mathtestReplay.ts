import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  SelectionGeometry,
  buildNodeResolutionSource,
  createSelectionControllerState,
  type NodeResolutionSource,
  resolveSelectionFromEvent,
  selectionNodeIds,
} from "../src/interaction/selectionController";
import type { EventFixture } from "../src/interaction/eventFixture";
import { compileMathDocument } from "../src/math/compile/compileMathDocument";

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
  };
  const replayFailures: string[] = [];
  let currentDomSnapshotId: string | null = null;
  let currentDomSnapshot: SelectionGeometry | null = null;
  let currentCompiledIndex = compileMathDocument(state.latex ?? "").index;
  let currentNodeResolution: NodeResolutionSource = buildNodeResolutionSource(
    [],
    currentCompiledIndex,
  );
  let selectionState = createSelectionControllerState();

  for (const event of fixture.events) {
    switch (event.type) {
      case "latex_accepted":
        state.latex = event.nextLatex ?? null;
        currentCompiledIndex = compileMathDocument(state.latex ?? "").index;
        currentNodeResolution = buildNodeResolutionSource(
          currentDomSnapshot?.nodeRects ?? [],
          currentCompiledIndex,
        );
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
        const result = resolveSelectionFromEvent({
          event: {
            type: "pointer_up",
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
        break;
      }
      case "pointer_down": {
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

  return failures;
}
