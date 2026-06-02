import { describe, expect, it } from "vitest";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../compile/compileMathDocument";
import { resolveHorizontalInsertionSlot } from "./types";
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

  it("rejects no-op multiplicative reorder within the same product", () => {
    const document = buildDocument(String.raw`a b`);
    const result = new RulesPipeline(
      document,
      null,
      { kind: "single", nodeId: "n2" },
      "n3",
      "multiplicative",
      "before",
    ).canMove();
    expect(result).toBe(false);
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

describe("resolveHorizontalInsertionSlot", () => {
  it("returns before when pointer is left of center", () => {
    expect(resolveHorizontalInsertionSlot(15, { left: 10, right: 30 })).toBe("before");
  });

  it("returns after when pointer is right of center", () => {
    expect(resolveHorizontalInsertionSlot(30, { left: 10, right: 30 })).toBe("after");
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

  it("prints moved prefix-negated additive terms as subtraction", () => {
    const document = buildDocument(
      String.raw`s=\left(c_P-R\right)\ln\left(\frac{T}{T_0}\right)+R\left(-\ln v_0+\ln v\right)+s_0`,
    );
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n23" },
      destinationId: "n19",
      moveType: "additive",
      destinationSlot: "before",
    });

    expect(result?.latex).toBe(
      String.raw`s = \left(c_P - R\right) \ln\left(\frac{T}{T_0}\right) + R \left(\ln v  - \ln v_0 \right) + s_0`,
    );
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

  it("removes zero when moving the only remaining term to the other side", () => {
    const document = buildDocument(String.raw`c_P-R-c_v=0`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n7" },
      destinationId: "n8",
      moveType: "additive",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe("c_P - R = c_v");
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

  it("executes moving a whole side across an equation under an existing product", () => {
    const document = buildDocument(String.raw`m v=V`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n5" },
      destinationId: "n3",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\frac{m v}{V} = 1`);
  });

  it("executes moving a whole side across an equation into a denominator", () => {
    const document = buildDocument(String.raw`a=c`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n3" },
      destinationId: "n2",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\frac{a}{c} = 1`);
  });

  it("executes extracting a numerator factor from a fraction", () => {
    const document = buildDocument(String.raw`\frac{a}{b}+c`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n3" },
      destinationId: "n2",
      moveType: "multiplicative",
      destinationSlot: "before",
    });

    expect(result?.latex).toBe(String.raw`a \frac{1}{b} + c`);
  });

  it("executes extracting a numerator factor to the right of a fraction", () => {
    const document = buildDocument(String.raw`\frac{F}{m a}=1`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n3" },
      destinationId: "n2",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\frac{1}{m a} F = 1`);
  });

  it("executes moving a numerator factor across an equation", () => {
    const document = buildDocument(String.raw`\frac{F}{m a}=1`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n3" },
      destinationId: "n7",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\frac{1}{m a} = \frac{1}{F}`);
  });

  it("executes moving a factor out of a fraction numerator across an equation", () => {
    const document = buildDocument(String.raw`\frac{m v}{V}=1`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n5" },
      destinationId: "n7",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\frac{m}{V} = \frac{1}{v}`);
  });

  it("executes moving a factor out of a fraction numerator locally", () => {
    const document = buildDocument(String.raw`\frac{m v}{V}=1`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n5" },
      destinationId: "n2",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\frac{m}{V} v = 1`);
  });

  it("executes extracting a denominator factor from a fraction", () => {
    const document = buildDocument(String.raw`\frac{F}{m a}=1`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n6" },
      destinationId: "n2",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\frac{F}{m} \frac{1}{a} = 1`);
  });

  it("executes extracting a denominator factor to the left of a fraction", () => {
    const document = buildDocument(String.raw`\frac{F}{m a}=1`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n5" },
      destinationId: "n2",
      moveType: "multiplicative",
      destinationSlot: "before",
    });

    expect(result?.latex).toBe(String.raw`\frac{1}{m} \frac{F}{a} = 1`);
  });

  it("executes moving a denominator factor across an equation", () => {
    const document = buildDocument(String.raw`\frac{F}{m a}=1`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n6" },
      destinationId: "n7",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\frac{F}{m} = a`);
  });

  it("executes moving a whole denominator across an equation", () => {
    const document = buildDocument(String.raw`\frac{F}{m a}=1`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n4" },
      destinationId: "n7",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe("F = m a");
  });

  it("executes moving a denominator through a product across an equation", () => {
    const document = buildDocument(String.raw`\frac{1}{c} \sin\left(x\right) = x`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n5" },
      destinationId: "n9",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\sin\left(x\right) = x c`);
  });

  it("executes extracting a single denominator from one factor of a product", () => {
    const document = buildDocument(String.raw`\frac{1}{a} \frac{b}{c}=5`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n8" },
      destinationId: "n6",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\frac{1}{a} b \frac{1}{c} = 5`);
  });

  it("executes moving a denominator from one fraction into another fraction", () => {
    const document = buildDocument(String.raw`\frac{1}{a} \frac{b}{c}=5`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n8" },
      destinationId: "n5",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\frac{1}{a c} b = 5`);
  });

  it("executes moving a numerator from one fraction into another fraction", () => {
    const document = buildDocument(String.raw`\frac{1}{a} \frac{b}{c}=5`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n7" },
      destinationId: "n4",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\frac{b}{a} \frac{1}{c} = 5`);
  });

  it("executes extracting a factor through a denominator delimiter", () => {
    const document = buildDocument(String.raw`\frac{b}{\left(b c\right)}`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n5" },
      destinationId: "n3",
      moveType: "multiplicative",
      destinationSlot: "before",
    });

    expect(result?.latex).toBe(String.raw`\frac{b}{b \left(c\right)}`);
  });
});
