import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { nextSelectedNodeIdFromEvent } from "../src/interaction/selectionController";
import type { TestRecorderEvent } from "../src/TestRecorder";

type EventFixture = {
  schemaVersion: number;
  exportedAtIso: string;
  events: TestRecorderEvent[];
  expected: {
    selectedNodeId?: string | null;
    latex?: string;
  };
};

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

function replayEvents(events: TestRecorderEvent[]) {
  const state = {
    selectedNodeId: null as string | null,
    latex: null as string | null,
  };

  for (const event of events) {
    state.selectedNodeId = nextSelectedNodeIdFromEvent(state.selectedNodeId, event);
    if (event.type === "latex_accepted") {
      state.latex = event.nextLatex ?? null;
    }
  }

  return state;
}

function buildAssertions(fixture: EventFixture, finalState: ReturnType<typeof replayEvents>) {
  const failures: string[] = [];
  const expected = fixture.expected ?? {};

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
      const finalState = replayEvents(fixture.events);
      const failures = buildAssertions(fixture, finalState);
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
