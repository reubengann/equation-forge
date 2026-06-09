import { stat } from "node:fs/promises";
import path from "node:path";
import {
  FIXTURE_DIR,
  ROOT_DIR,
  buildAssertions,
  parseFixture,
  replayEvents,
  resolveCandidateFiles,
  walkJsonFiles,
} from "./mathtestReplay";

function getArgFilter() {
  return process.argv.slice(2).join(" ").trim();
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
