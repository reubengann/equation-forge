import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  SelectionGeometry,
  buildNodeResolutionSource,
  createSelectionControllerState,
  type NodeResolutionSource,
  resolveSelectionFromEvent,
} from "../src/interaction/selectionController";
import type { EventFixture } from "../src/interaction/eventFixture";
import { compileMathDocument } from "../src/math/compile/compileMathDocument";

const ROOT_DIR = process.cwd();
const FIXTURE_DIR = path.join(ROOT_DIR, "mathtests", "fixtures");

function getArgFilter() {
  return process.argv.slice(2).join(" ").trim();
}

async function walkJsonFiles(dirPath: string): Promise<string[]> {
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

function resolveCandidateFiles(files: string[], rawFilter: string) {
  if (!rawFilter) return files;
  const normalizedFilter = rawFilter.toLowerCase();
  return files.filter((filePath) =>
    path.basename(filePath).toLowerCase().includes(normalizedFilter),
  );
}

function replayEvents(fixture: EventFixture) {
  const state = {
    selectedNodeId: null as string | null,
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
          },
          nodeResolution: currentNodeResolution,
          index: currentCompiledIndex,
          state: selectionState,
        });
        selectionState = result;
        state.selectedNodeId = result.selectedNodeId;
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
          },
          nodeResolution: currentNodeResolution,
          index: currentCompiledIndex,
          state: selectionState,
        });
        selectionState = result;
        state.selectedNodeId = result.selectedNodeId;
        break;
      }
      default:
        break;
    }
  }

  return { state, replayFailures };
}

function buildAssertions(
  fixture: EventFixture,
  replayResult: ReturnType<typeof replayEvents>,
) {
  const failures: string[] = [];
  failures.push(...replayResult.replayFailures);
  const expected = fixture.expected ?? {};
  const finalState = replayResult.state;

  if ("selectedNodeId" in expected) {
    if (finalState.selectedNodeId !== expected.selectedNodeId) {
      failures.push(
        `selectedNodeId expected=${JSON.stringify(expected.selectedNodeId)} actual=${JSON.stringify(finalState.selectedNodeId)}`,
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

async function parseFixture(filePath: string): Promise<EventFixture> {
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

async function main() {
  const filter = getArgFilter();

  try {
    const fixtureDirStat = await stat(FIXTURE_DIR);
    if (!fixtureDirStat.isDirectory()) {
      throw new Error("Fixture directory path is not a directory.");
    }
  } catch {
    console.error(
      `No fixture directory found at ${FIXTURE_DIR}. Create it and add exported JSON fixtures.`,
    );
    process.exit(1);
  }

  const allJsonFiles = await walkJsonFiles(FIXTURE_DIR);
  const fixtureFiles = resolveCandidateFiles(allJsonFiles, filter);

  if (fixtureFiles.length === 0) {
    const suffix = filter ? ` matching "${filter}"` : "";
    console.error(`No fixture JSON files found${suffix} in ${FIXTURE_DIR}.`);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const filePath of fixtureFiles) {
    const relativePath = path.relative(ROOT_DIR, filePath);
    try {
      const fixture = await parseFixture(filePath);
      const replayResult = replayEvents(fixture);
      const failures = buildAssertions(fixture, replayResult);
      if (failures.length === 0) {
        passed += 1;
        console.log(`PASS ${relativePath}`);
      } else {
        failed += 1;
        console.error(`FAIL ${relativePath}`);
        for (const message of failures) {
          console.error(`  - ${message}`);
        }
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAIL ${relativePath}`);
      console.error(`  - ${message}`);
    }
  }

  console.log(`\nMath tests: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

void main();
