/// <reference types="node" />
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { parse as parseYaml } from "yaml";
import {
  mathPadFacade,
  type MJ,
  type MathAction,
  type NodeSelector,
  type SelectionSpec,
} from "../application";
import type { MoveMode } from "../moveExpression/applyMove";
import { applyMove } from "../moveExpression/applyMove";
import {
  applyReplayResult,
  replayFinalMoveSample,
  replayMoveCapture,
  type MoveCaptureFixture,
} from "../domain/move/moveDebugFixture";

type JsonRecord = Record<string, unknown>;

export type MathScenario = {
  version: number;
  name: string;
  tags: string[];
  initial: {
    latex?: string;
    mathJson?: MJ;
  };
  steps: ScenarioStep[];
};

export type ScenarioStep = {
  name?: string;
  select?: SelectionSpec;
  action: StepActionInput;
  expect?: {
    latex?: string;
    mathJson?: MJ;
  };
  expectError?: true | string;
};

type StepActionInput = string | (JsonRecord & { type?: unknown });

type ReplayMoveAction = {
  type: "moveReplay";
  mode: MoveMode;
  selectedIds: string[];
  fixturePath?: string;
  fallbackTarget?: { hoverId: string; targetSlot: number | null };
  expectPlanKind?: string;
  finalSampleOnly?: boolean;
};

type ParsedAction = MathAction | ReplayMoveAction;

export type StepExecutionResult = {
  index: number;
  name: string;
  action: string;
  selection: string;
  expectedLatex?: string;
  actualLatex?: string;
};

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function maybeString(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  return value;
}

function parsePath(value: unknown, label: string): number[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of numbers.`);
  }
  return value.map((item, idx) => {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0) {
      throw new Error(`${label}[${idx}] must be a non-negative integer.`);
    }
    return item;
  });
}

function parseNodeSelector(raw: unknown, label: string): NodeSelector {
  const record = asRecord(raw, label);
  if ("path" in record) {
    return { path: parsePath(record.path, `${label}.path`) };
  }
  if ("latex" in record) {
    return { latex: asString(record.latex, `${label}.latex`) };
  }
  if ("nodeId" in record) {
    return { nodeId: asString(record.nodeId, `${label}.nodeId`) };
  }
  throw new Error(`${label} must contain one of: path, latex, nodeId.`);
}

function parseSelection(raw: unknown): SelectionSpec {
  const record = asRecord(raw, "step.select");
  const kind = asString(record.kind, "step.select.kind");

  if (kind === "node") {
    if ("by" in record) {
      return { kind: "node", by: parseNodeSelector(record.by, "step.select.by") };
    }
    if ("path" in record) {
      return {
        kind: "node",
        by: { path: parsePath(record.path, "step.select.path") },
      };
    }
    if ("latex" in record) {
      return {
        kind: "node",
        by: { latex: asString(record.latex, "step.select.latex") },
      };
    }
    if ("nodeId" in record) {
      return {
        kind: "node",
        by: { nodeId: asString(record.nodeId, "step.select.nodeId") },
      };
    }
    throw new Error("step.select for kind=node requires by/path/latex/nodeId.");
  }

  if (kind === "span") {
    const op = asString(record.op, "step.select.op");
    if (op !== "Add" && op !== "InvisibleOperator") {
      throw new Error("step.select.op must be Add or InvisibleOperator.");
    }
    let parent: NodeSelector | null = null;
    if ("parent" in record) {
      parent = parseNodeSelector(record.parent, "step.select.parent");
    } else if ("parentPath" in record) {
      parent = {
        path: parsePath(record.parentPath, "step.select.parentPath"),
      };
    } else if ("parentLatex" in record) {
      parent = {
        latex: asString(record.parentLatex, "step.select.parentLatex"),
      };
    } else if ("parentId" in record) {
      parent = {
        nodeId: asString(record.parentId, "step.select.parentId"),
      };
    }
    if (!parent) {
      throw new Error(
        "step.select for kind=span requires parent or parentPath/parentLatex/parentId."
      );
    }
    return {
      kind: "span",
      parent,
      op,
      start: asNumber(record.start, "step.select.start"),
      end: asNumber(record.end, "step.select.end"),
    };
  }

  if (kind === "multi") {
    if ("items" in record) {
      const rawItems = record.items;
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        throw new Error("step.select.items must be a non-empty array.");
      }
      return {
        kind: "multi",
        items: rawItems.map((item, idx) =>
          parseNodeSelector(item, `step.select.items[${idx}]`)
        ),
      };
    }
    if ("paths" in record) {
      const rawPaths = record.paths;
      if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
        throw new Error("step.select.paths must be a non-empty array.");
      }
      return {
        kind: "multi",
        items: rawPaths.map((value, idx) => ({
          path: parsePath(value, `step.select.paths[${idx}]`),
        })),
      };
    }
    throw new Error("step.select for kind=multi requires items or paths.");
  }

  throw new Error(`Unsupported step.select.kind: ${kind}`);
}

function parseExpected(raw: unknown): { latex?: string; mathJson?: MJ } {
  const record = asRecord(raw, "step.expect");
  const expected: { latex?: string; mathJson?: MJ } = {};
  if ("latex" in record) expected.latex = asString(record.latex, "step.expect.latex");
  if ("mathJson" in record) expected.mathJson = record.mathJson as MJ;
  if (!expected.latex && expected.mathJson === undefined) {
    throw new Error("step.expect must include latex or mathJson.");
  }
  return expected;
}

function parseStep(raw: unknown, idx: number, prefix = "steps"): ScenarioStep {
  const record = asRecord(raw, `${prefix}[${idx}]`);
  if (!("action" in record)) {
    throw new Error(`${prefix}[${idx}] is missing action.`);
  }

  const step: ScenarioStep = {
    name: typeof record.name === "string" ? record.name : undefined,
    action: record.action as StepActionInput,
  };

  if ("select" in record) step.select = parseSelection(record.select);
  if ("expect" in record) step.expect = parseExpected(record.expect);
  if ("expectError" in record) {
    if (record.expectError === true || typeof record.expectError === "string") {
      step.expectError = record.expectError;
    } else {
      throw new Error(`${prefix}[${idx}].expectError must be true or a string.`);
    }
  }
  return step;
}

function parseScenarioObject(raw: unknown, label: string): MathScenario {
  const root = asRecord(raw, label);
  const version = "version" in root ? asNumber(root.version, `${label}.version`) : 1;
  const name = asString(root.name, `${label}.name`);

  const initialRaw = asRecord(root.initial, `${label}.initial`);
  const initial: MathScenario["initial"] = {};
  if ("latex" in initialRaw) {
    initial.latex = asString(initialRaw.latex, `${label}.initial.latex`);
  }
  if ("mathJson" in initialRaw) {
    initial.mathJson = initialRaw.mathJson as MJ;
  }
  if (!initial.latex && initial.mathJson === undefined) {
    throw new Error(`${label}.initial must include latex or mathJson.`);
  }

  const stepsRaw = root.steps;
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
    throw new Error(`${label}.steps must be a non-empty array.`);
  }

  const tags =
    Array.isArray(root.tags) && root.tags.every((x) => typeof x === "string")
      ? (root.tags as string[])
      : [];

  return {
    version,
    name,
    tags,
    initial,
    steps: stepsRaw.map((step, idx) => parseStep(step, idx, `${label}.steps`)),
  };
}

export function parseScenarioYamlFile(filePath: string): MathScenario[] {
  const text = readFileSync(filePath, "utf8");
  const parsed = parseYaml(text) as unknown;

  // Backward-compatible single-scenario files (current format).
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const root = parsed as JsonRecord;
    if ("scenarios" in root) {
      const scenariosRaw = root.scenarios;
      if (!Array.isArray(scenariosRaw) || scenariosRaw.length === 0) {
        throw new Error("scenarios must be a non-empty array.");
      }
      return scenariosRaw.map((scenario, idx) =>
        parseScenarioObject(scenario, `scenarios[${idx}]`)
      );
    }
  }

  // New compact format: top-level array of scenarios.
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new Error("Top-level scenarios array must be non-empty.");
    }
    return parsed.map((scenario, idx) =>
      parseScenarioObject(scenario, `scenarios[${idx}]`)
    );
  }

  return [parseScenarioObject(parsed, "scenario")];
}

export function parseScenarioYaml(filePath: string): MathScenario {
  const scenarios = parseScenarioYamlFile(filePath);
  if (scenarios.length !== 1) {
    throw new Error(
      `Expected exactly one scenario in '${filePath}', found ${scenarios.length}. Use parseScenarioYamlFile() for multi-scenario files.`
    );
  }
  return scenarios[0];
}

function parseActionFromStep(
  tree: ReturnType<typeof mathPadFacade.createTree>,
  selection: ReturnType<typeof mathPadFacade.resolveSelection>,
  step: ScenarioStep,
  selectionText: string,
  scenarioFilePath?: string
): ParsedAction {
  const actionInput = step.action;
  const actionRecord =
    typeof actionInput === "string"
      ? ({ type: actionInput } as JsonRecord)
      : asRecord(actionInput, "step.action");

  const type = asString(actionRecord.type, "step.action.type");

  if (type === "flip") return { type: "flip" };
  if (type === "expand") return { type: "expand" };
  if (type === "factor") return { type: "factor" };
  if (type === "cancel") return { type: "cancel" };
  if (type === "toggleDelimiterStyle") return { type: "toggleDelimiterStyle" };
  if (type === "evaluate") return { type: "evaluate" };

  if (type === "apply" || type === "applyToBothSides") {
    return {
      type: "applyToBothSides",
      operationLatex: asString(
        actionRecord.operationLatex,
        "step.action.operationLatex"
      ),
    };
  }

  if (type === "substitute") {
    const replacementLatex = asString(
      actionRecord.replacementLatex,
      "step.action.replacementLatex"
    );
    const replacement = mathPadFacade.parseLatex(replacementLatex);
    if (replacement == null) {
      throw new Error(
        `Could not parse replacementLatex '${replacementLatex}' for selection ${selectionText}.`
      );
    }
    const scope =
      "scope" in actionRecord
        ? maybeString(actionRecord.scope, "single")
        : "single";
    if (scope !== "single" && scope !== "all") {
      throw new Error("step.action.scope must be single or all.");
    }
    let targetId: string | undefined;
    if ("target" in actionRecord) {
      const targetSelector = parseNodeSelector(actionRecord.target, "step.action.target");
      targetId = mathPadFacade.resolveNodeId(tree, targetSelector) ?? undefined;
      if (!targetId) {
        throw new Error(`Could not resolve step.action.target for selection ${selectionText}.`);
      }
    }
    return {
      type: "substitute",
      replacement,
      scope,
      targetId,
    };
  }

  if (type === "move" || type === "moveReplay") {
    const selectedRaw = actionRecord.selected;
    let selectedIds: string[] = [];
    if (Array.isArray(selectedRaw)) {
      selectedIds = selectedRaw
        .map((entry, idx) =>
          mathPadFacade.resolveNodeId(
            tree,
            parseNodeSelector(entry, `step.action.selected[${idx}]`)
          )
        )
        .filter((id): id is string => !!id);
    } else if (selection?.kind === "node") {
      selectedIds = [selection.nodeId];
    } else if (selection?.kind === "multi") {
      selectedIds = selection.nodeIds;
    }
    if (selectedIds.length === 0) {
      throw new Error(
        "step.action.selected must resolve to one or more nodes for move actions."
      );
    }

    const fallbackTarget = (() => {
      if (!("hover" in actionRecord)) return undefined;
      const hoverSelector = parseNodeSelector(actionRecord.hover, "step.action.hover");
      const hoverId = mathPadFacade.resolveNodeId(tree, hoverSelector);
      if (!hoverId) {
        throw new Error("Could not resolve step.action.hover for move action.");
      }
      const targetSlotRaw = actionRecord.targetSlot;
      const targetSlot =
        targetSlotRaw === null
          ? null
          : asNumber(targetSlotRaw, "step.action.targetSlot");
      return { hoverId, targetSlot };
    })();
    const mode =
      "mode" in actionRecord
        ? maybeString(actionRecord.mode, "additive")
        : "additive";
    if (mode !== "additive" && mode !== "multiplicative") {
      throw new Error("step.action.mode must be additive or multiplicative.");
    }
    const fixturePath = (() => {
      if (!("fixture" in actionRecord)) return undefined;
      const rawFixture = asString(actionRecord.fixture, "step.action.fixture");
      if (scenarioFilePath) {
        return resolve(dirname(scenarioFilePath), rawFixture);
      }
      return resolve(process.cwd(), rawFixture);
    })();
    const expectPlanKind =
      "expectPlanKind" in actionRecord
        ? asString(actionRecord.expectPlanKind, "step.action.expectPlanKind")
        : undefined;
    const finalSampleOnly =
      "finalSampleOnly" in actionRecord
        ? actionRecord.finalSampleOnly === true
        : undefined;

    return {
      type: "moveReplay",
      mode,
      selectedIds,
      fixturePath,
      fallbackTarget,
      expectPlanKind,
      finalSampleOnly,
    };
  }

  throw new Error(`Unsupported action type: ${type}`);
}

function normalizeLatex(value: string): string {
  return value.replace(/\\,/g, " ").replace(/\s+/g, " ").trim();
}

function deepEqualMJ(a: MJ, b: MJ): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualMJ(a[i], b[i])) return false;
    }
    return true;
  }
  return a === b;
}

const fixtureCache = new Map<string, MoveCaptureFixture>();

function loadMoveFixture(filePath: string): MoveCaptureFixture {
  const cached = fixtureCache.get(filePath);
  if (cached) return cached;
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as MoveCaptureFixture;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.samples)) {
    throw new Error(`Invalid move fixture file: ${filePath}`);
  }
  fixtureCache.set(filePath, parsed);
  return parsed;
}

function executeReplayMoveAction(args: {
  tree: ReturnType<typeof mathPadFacade.createTree>;
  action: ReplayMoveAction;
}): ReturnType<typeof mathPadFacade.applyAction> {
  const { tree, action } = args;
  let effectiveSelectedIds = action.selectedIds;
  let derivedFallbackTarget: { hoverId: string; targetSlot: number | null } | null =
    action.fallbackTarget ?? null;
  let replayDebug:
    | {
        selectedIds: string[];
        finalPlanKind: string | null;
        finalTarget: { hoverId: string; targetSlot: number | null } | null;
      }
    | null = null;

  if (action.fixturePath) {
    const fixture = loadMoveFixture(action.fixturePath);
    const selectedIds =
      action.selectedIds.length > 0 ? action.selectedIds : fixture.selectedIds;
    effectiveSelectedIds = selectedIds;
    const finalOnly =
      action.finalSampleOnly === true ||
      process.env.DP_REPLAY_FINAL_SAMPLE_ONLY === "1";
    const replay = finalOnly
      ? replayFinalMoveSample({
          tree,
          mode: action.mode,
          selectedIds,
          rects: fixture.rects,
          samples: fixture.samples,
        })
      : replayMoveCapture({
          tree,
          mode: action.mode,
          selectedIds,
          rects: fixture.rects,
          samples: fixture.samples,
        });
    replayDebug = {
      selectedIds,
      finalPlanKind: replay.finalPlan?.kind ?? null,
      finalTarget: replay.finalTarget ?? null,
    };

    if (action.expectPlanKind) {
      const planKind = replay.finalPlan?.kind ?? "null";
      if (planKind !== action.expectPlanKind) {
        return {
          ok: false,
          reason: `Expected final plan kind '${action.expectPlanKind}', got '${planKind}'.`,
        };
      }
    }

    const replayNext = applyReplayResult({
      tree,
      mode: action.mode,
      selectedIds,
      replay,
    });
    if (replayNext) {
      return { ok: true, tree: replayNext };
    }

    // If final-sample replay has no target (common when pointer-up hovers nothing),
    // recover by using the latest frame in a full replay that produced an apply target.
    const latestFrameTarget =
      [...replay.frames].reverse().find((f) => !!f.applyTarget)?.applyTarget ?? null;
    if (latestFrameTarget) {
      derivedFallbackTarget = latestFrameTarget;
    } else if (finalOnly) {
      const fullReplay = replayMoveCapture({
        tree,
        mode: action.mode,
        selectedIds,
        rects: fixture.rects,
        samples: fixture.samples,
      });
      derivedFallbackTarget =
        [...fullReplay.frames].reverse().find((f) => !!f.applyTarget)?.applyTarget ??
        null;
    }
  }

  if (!derivedFallbackTarget) {
    return {
      ok: false,
      reason: `Move replay did not produce a target and no fallbackTarget was provided.${
        replayDebug ? ` Debug: ${JSON.stringify(replayDebug)}` : ""
      }`,
    };
  }

  const next = applyMove({
    tree,
    selectedIds: effectiveSelectedIds,
    hoverId: derivedFallbackTarget.hoverId,
    targetSlot: derivedFallbackTarget.targetSlot,
    mode: action.mode,
  });
  if (!next) {
    return {
      ok: false,
      reason: "Move replay fallback produced no change.",
    };
  }
  return { ok: true, tree: next };
}

function selectionDebugText(selection: SelectionSpec | null): string {
  if (!selection) return "none";
  return JSON.stringify(selection);
}

export function executeScenario(
  scenario: MathScenario,
  opts?: { scenarioFilePath?: string }
): { finalLatex: string; steps: StepExecutionResult[] } {
  const initialJson =
    scenario.initial.mathJson ??
    (() => {
      const parsed = mathPadFacade.parseLatex(scenario.initial.latex ?? "");
      if (!parsed) {
        throw new Error(
          `Scenario '${scenario.name}' failed to parse initial latex: ${scenario.initial.latex}`
        );
      }
      return parsed;
    })();

  let tree = mathPadFacade.createTree(initialJson);
  const stepResults: StepExecutionResult[] = [];

  scenario.steps.forEach((step, index) => {
    const stepName = step.name ?? `step ${index + 1}`;
    const selection = step.select
      ? mathPadFacade.resolveSelection(tree, step.select)
      : null;

    if (step.select && !selection) {
      throw new Error(
        `Scenario '${scenario.name}' ${stepName}: selection could not be resolved (${selectionDebugText(
          step.select
        )}).`
      );
    }

    const action = parseActionFromStep(
      tree,
      selection,
      step,
      selectionDebugText(step.select ?? null),
      opts?.scenarioFilePath
    );
    const result =
      action.type === "moveReplay"
        ? executeReplayMoveAction({ tree, action })
        : mathPadFacade.applyAction({ tree, selection, action });
    const actionName = typeof step.action === "string" ? step.action : String(step.action.type);

    if (step.expectError) {
      if (result.ok) {
        throw new Error(
          `Scenario '${scenario.name}' ${stepName}: expected an error for action '${actionName}' but got success (${result.tree.latexPlain}).`
        );
      }
      if (
        typeof step.expectError === "string" &&
        !result.reason.toLowerCase().includes(step.expectError.toLowerCase())
      ) {
        throw new Error(
          `Scenario '${scenario.name}' ${stepName}: expected error containing '${step.expectError}', got '${result.reason}'.`
        );
      }
      stepResults.push({
        index,
        name: stepName,
        action: actionName,
        selection: selectionDebugText(step.select ?? null),
      });
      return;
    }

    if (!result.ok) {
      throw new Error(
        `Scenario '${scenario.name}' ${stepName}: action '${actionName}' failed.\nSelection: ${selectionDebugText(
          step.select ?? null
        )}\nReason: ${result.reason}`
      );
    }

    tree = result.tree;
    const actualLatex = normalizeLatex(tree.latexPlain);

    if (step.expect?.latex) {
      const expectedLatex = normalizeLatex(step.expect.latex);
      if (actualLatex !== expectedLatex) {
        throw new Error(
          `Scenario '${scenario.name}' ${stepName}: latex mismatch.\nAction: ${actionName}\nSelection: ${selectionDebugText(
            step.select ?? null
          )}\nExpected: ${expectedLatex}\nActual:   ${actualLatex}`
        );
      }
    }

    if (step.expect?.mathJson !== undefined) {
      if (!deepEqualMJ(tree.rootJson, step.expect.mathJson)) {
        throw new Error(
          `Scenario '${scenario.name}' ${stepName}: mathJson mismatch.\nAction: ${actionName}\nSelection: ${selectionDebugText(
            step.select ?? null
          )}\nExpected: ${JSON.stringify(step.expect.mathJson)}\nActual:   ${JSON.stringify(
            tree.rootJson
          )}`
        );
      }
    }

    stepResults.push({
      index,
      name: stepName,
      action: actionName,
      selection: selectionDebugText(step.select ?? null),
      expectedLatex: step.expect?.latex,
      actualLatex: tree.latexPlain,
    });
  });

  return { finalLatex: tree.latexPlain, steps: stepResults };
}
