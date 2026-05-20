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
  it("returns before when pointer is left of center", () => {
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
    });
    expect(preview?.destinationSlot).toBe("before");
  });

  it("returns after when pointer is right of center", () => {
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

  it("allows moving an additive term to the other side of an equation", () => {
    const document = buildDocument(String.raw`a+b=c`);
    const preview = canExecuteMove({
      document,
      selection: { kind: "single", nodeId: "n4" },
      destinationId: "n5",
      moveType: "additive",
      destinationSlot: "after",
    });

    expect(preview).toEqual({
      containerId: "n5",
      containerKind: "add",
      destinationId: "n5",
      destinationSlot: "after",
      lineOrientation: "vertical",
    });
  });

  it("executes moving an additive term to the other side of an equation", () => {
    const document = buildDocument(String.raw`a+b=c`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n4" },
      destinationId: "n5",
      moveType: "additive",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe("a = c - b");
  });

  it("inserts a cross-equation additive move into an existing sum", () => {
    const document = buildDocument(String.raw`a=b+c`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n2" },
      destinationId: "n4",
      moveType: "additive",
      destinationSlot: "before",
    });

    expect(result?.latex).toBe("0 = -a + b + c");
  });

  it("executes moving multiple selected additive terms to the other side of an equation", () => {
    const document = buildDocument(String.raw`a+b=c`);
    const result = executeMove({
      document,
      selection: { kind: "multi", nodeIds: ["n3", "n4"], containerNodeId: "n2" },
      destinationId: "n5",
      moveType: "additive",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`0 = c - \left(a + b\right)`);
  });

  it("executes moving a selected sum to the other side of an equation", () => {
    const document = buildDocument(String.raw`a+b=c`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n2" },
      destinationId: "n5",
      moveType: "additive",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`0 = c - \left(a + b\right)`);
  });

  it("does not move a single additive term out of a denominator sum", () => {
    const document = buildDocument(String.raw`\frac{b + a}{d + c} = d`);
    const preview = canExecuteMove({
      document,
      selection: { kind: "single", nodeId: "n8" },
      destinationId: "n9",
      moveType: "additive",
      destinationSlot: "after",
    });

    expect(preview).toBeNull();
  });

  it("executes moving a subtraction term back across an equation", () => {
    const document = buildDocument(String.raw`a=c-b`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n6" },
      destinationId: "n2",
      moveType: "additive",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe("a + b = c");
  });

  it("previews moving a multiplicative factor across an equation as a denominator drop", () => {
    const document = buildDocument(String.raw`F=m a`);
    const preview = canExecuteMove({
      document,
      selection: { kind: "single", nodeId: "n5" },
      destinationId: "n2",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(preview).toEqual({
      containerId: "n2",
      containerKind: "divide",
      destinationId: "n2",
      destinationSlot: "after",
      lineOrientation: "horizontal",
    });
  });

  it("executes moving a multiplicative factor across an equation into the denominator", () => {
    const document = buildDocument(String.raw`F=m a`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n5" },
      destinationId: "n2",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\frac{F}{a} = m`);
  });
});
