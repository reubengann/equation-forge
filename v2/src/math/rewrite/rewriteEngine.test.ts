import { describe, expect, it } from "vitest";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import {
  canExecuteMove,
  executeMove,
  findPath,
  RulesPipeline,
} from "./rewriteEngine";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

describe("RulesPipeline", () => {
  it("rejects move if the selection is the same as the destination", () => {
    const document = buildDocument(String.raw`a+b`);
    const result = new RulesPipeline(
      document,
      [],
      { kind: "single", nodeId: "n1" },
      "n1",
      "additive",
    ).canMove();
    expect(result).toBe(false);
  });

  it("allows additive reorder within the same sum", () => {
    const document = buildDocument(String.raw`a+b`);
    const result = new RulesPipeline(
      document,
      null,
      { kind: "single", nodeId: "n2" },
      "n3",
      "additive",
      "after",
    ).canMove();
    expect(result).toBe(true);
  });

  it("rejects move when extraction rule is unavailable", () => {
    const document = buildDocument(String.raw`a+b`);
    const result = new RulesPipeline(
      document,
      [],
      { kind: "single", nodeId: "n2" },
      "n3",
      "additive",
    ).canMove();
    expect(result).toBe(false);
  });

  it("allows multiplicative reorder within the same product", () => {
    const document = buildDocument(String.raw`a b`);
    const result = new RulesPipeline(
      document,
      null,
      { kind: "single", nodeId: "n2" },
      "n3",
      "multiplicative",
      "after",
    ).canMove();
    expect(result).toBe(true);
  });

  it("returns insertion preview with container and orientation", () => {
    const document = buildDocument(String.raw`a+b`);
    const preview = new RulesPipeline(
      document,
      null,
      { kind: "single", nodeId: "n2" },
      "n3",
      "additive",
      "after",
    ).getInsertionPreview();
    expect(preview).toEqual({
      containerId: "n1",
      containerKind: "add",
      destinationId: "n3",
      destinationSlot: "after",
      lineOrientation: "vertical",
    });
  });
});

describe("treeTools", () => {
  it("finds the pivot", () => {
    const document = buildDocument(String.raw`a+b`);
    const path = findPath(document, "n2", "n3");
    expect(path).toEqual({
      pivotId: "n1", //sum
      upNodes: ["n2"], // a
      downNodes: ["n3"], // b
    });
  });
});

describe("canExecuteMove slot resolution", () => {
  it("returns before when pointer is near/left of center", () => {
    const document = buildDocument(String.raw`a+b`);
    const preview = canExecuteMove({
      document,
      selection: { kind: "single", nodeId: "n3" },
      destinationId: "n2",
      moveType: "additive",
      pointerX: 15,
      rectById: {
        n2: { left: 10, right: 30 },
      },
      rightOfCenterMarginPx: 8,
    });
    expect(preview?.destinationSlot).toBe("before");
  });

  it("returns after when pointer is significantly right of center", () => {
    const document = buildDocument(String.raw`a+b`);
    const preview = canExecuteMove({
      document,
      selection: { kind: "single", nodeId: "n2" },
      destinationId: "n3",
      moveType: "additive",
      pointerX: 30,
      rectById: {
        n3: { left: 10, right: 30 },
      },
      rightOfCenterMarginPx: 8,
    });
    expect(preview?.destinationSlot).toBe("after");
  });
});

describe("canExecuteMove", () => {
  it("returns null when move is disallowed", () => {
    const document = buildDocument(String.raw`a+b`);
    const preview = canExecuteMove({
      document,
      selection: { kind: "single", nodeId: "n2" },
      destinationId: "n2",
      moveType: "additive",
    });
    expect(preview).toBeNull();
  });

  it("allows moving b before a in the left side of an equation", () => {
    const document = buildDocument(String.raw`a+b=c`);
    const preview = canExecuteMove({
      document,
      selection: { kind: "single", nodeId: "n4" },
      destinationId: "n3",
      moveType: "additive",
      destinationSlot: "before",
    });

    expect(preview).toEqual({
      containerId: "n2",
      containerKind: "add",
      destinationId: "n3",
      destinationSlot: "before",
      lineOrientation: "vertical",
    });
  });

  it("executes moving b before a in the left side of an equation", () => {
    const document = buildDocument(String.raw`a+b=c`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n4" },
      destinationId: "n3",
      moveType: "additive",
      destinationSlot: "before",
    });

    expect(result?.latex).toBe("b + a = c");
  });
});
