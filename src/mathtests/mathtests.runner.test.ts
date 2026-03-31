/// <reference types="node" />
import { readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";
import { executeScenario, parseScenarioYamlFile } from "./scenarioEngine";

function listScenarioFiles(rootDir: string): string[] {
  const entries = readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listScenarioFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (fullPath.endsWith(".yml") || fullPath.endsWith(".yaml")) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

describe("math scenarios", () => {
  const scenarioRoot = join(process.cwd(), "mathtests");
  const hasScenarioRoot = (() => {
    try {
      return statSync(scenarioRoot).isDirectory();
    } catch {
      return false;
    }
  })();

  const scenarioFiles = hasScenarioRoot ? listScenarioFiles(scenarioRoot) : [];
  const fileToScenarios = scenarioFiles.map((filePath) => ({
    filePath,
    scenarios: parseScenarioYamlFile(filePath),
  }));
  const scenarioCount = fileToScenarios.reduce(
    (acc, entry) => acc + entry.scenarios.length,
    0
  );

  it("loads at least one scenario from YAML files", () => {
    expect(scenarioCount).toBeGreaterThan(0);
  });

  for (const { filePath, scenarios } of fileToScenarios) {
    const relPath = relative(process.cwd(), filePath);
    scenarios.forEach((scenario, scenarioIdx) => {
      const caseLabel =
        scenarios.length === 1
          ? scenario.name
          : `${scenario.name} [${scenarioIdx + 1}]`;
      it(`executes ${relPath} :: ${caseLabel}`, () => {
        const result = executeScenario(scenario, { scenarioFilePath: filePath });
        expect(result.steps.length).toBeGreaterThan(0);
      });
    });
  }
});
