import { describe, expect, it } from "vitest";
import { parseLatexToExpr } from "../adapters/latex/parseLatexToExpr";
import type { Expr } from "../ast";
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

function findNodeId(document: CompiledMathDocument, predicate: (expr: Expr) => boolean): string {
  const entry = Object.entries(document.index.nodeById).find(([, expr]) => predicate(expr));
  expect(entry).toBeDefined();
  return entry![0];
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

  it("moves a multiplicative factor into an existing fraction numerator", () => {
    const document = buildDocument(String.raw`\frac{1}{2} \kappa \left(P - P_0\right)`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n5" },
      destinationId: "n3",
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\frac{\kappa}{2} \left(P - P_0\right)`);
  });

  it("splits a selected term out of a negative fraction numerator additively", () => {
    const document = buildDocument(String.raw`P_0+\frac{\beta T_0}{\kappa}-\frac{v-v_0}{2 v_0 \kappa}`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n10" },
      destinationId: "n8",
      moveType: "additive",
      destinationSlot: "before",
    });

    expect(result?.latex).toBe(
      String.raw`P_0 + \frac{\beta T_0}{\kappa} - \frac{v}{2 v_0 \kappa} + \frac{v_0}{2 v_0 \kappa}`,
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
    const selectedNodeId = findNodeId(
      document,
      (expr) => expr.kind === "symbol" && expr.name === "c_v" && expr.sign === -1,
    );
    const destinationId = findNodeId(document, (expr) => expr.kind === "number" && Number(expr.value) === 0);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: selectedNodeId },
      destinationId,
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

  it("executes splitting a fraction over a selected numerator sum term", () => {
    const document = buildDocument(String.raw`\frac{a + b T}{T}`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n4" },
      destinationId: "n1",
      moveType: "additive",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`\frac{a}{T} + \frac{b T}{T}`);
  });

  it("delimits a split fraction sum inside an integral integrand product", () => {
    const document = buildDocument(String.raw`\int_{T_0}^{T} \frac{a + b T}{T} \,\mathrm{d}{T}`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n8" },
      destinationId: "n5",
      moveType: "additive",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(
      String.raw`\int_{T_0}^{T} \left(\frac{a}{T} + \frac{b T}{T}\right) \,\mathrm{d}{T}`,
    );
  });

  it("executes moving a subtraction term back across an equation", () => {
    const document = buildDocument(String.raw`a=c-b`);
    const selectedNodeId = findNodeId(
      document,
      (expr) => expr.kind === "symbol" && expr.name === "b" && expr.sign === -1,
    );
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: selectedNodeId },
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

  it("moves multiple selected factors within the same signed product without dropping them", () => {
    const document = buildDocument(String.raw`a - \left(T - T_0\right) P_0 v_0 \beta`);
    const productId = findNodeId(
      document,
      (expr) =>
        expr.kind === "multiply" &&
        expr.sign === -1 &&
        expr.factors.some((factor) => factor.kind === "symbol" && factor.name === "v_0") &&
        expr.factors.some((factor) => factor.kind === "symbol" && factor.name === "\\beta"),
    );
    const childIds = document.index.childrenById[productId] ?? [];
    const selectedIds = childIds.filter((childId) => {
      const expr = document.index.nodeById[childId];
      return expr?.kind === "symbol" && (expr.name === "v_0" || expr.name === "\\beta");
    });
    const destinationId = childIds.find((childId) => document.index.nodeById[childId]?.kind === "display_group");
    expect(selectedIds).toHaveLength(2);
    expect(destinationId).toBeDefined();

    const result = executeMove({
      document,
      selection: { kind: "multi", containerNodeId: productId, nodeIds: selectedIds },
      destinationId: destinationId!,
      moveType: "multiplicative",
      destinationSlot: "before",
    });

    expect(result?.latex).toBe(String.raw`a - v_0 \beta \left(T - T_0\right) P_0`);
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

  it("executes extracting a multiplicative factor out of an uniterated integral", () => {
    const document = buildDocument(String.raw`\Delta s = \int \frac{1}{T} P \,\mathrm{d}{v}`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n5" },
      destinationId: "n3",
      moveType: "multiplicative",
      destinationSlot: "before",
    });

    expect(result?.latex).toBe(String.raw`\Delta s = \frac{1}{T} \int P \,\mathrm{d}{v}`);
  });

  it("executes extracting a multiplicative factor out of a bounded integral", () => {
    const document = buildDocument(String.raw`\int_a^b c P \,\mathrm{d}{v}`);
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: "n5" },
      destinationId: "n1",
      moveType: "multiplicative",
      destinationSlot: "before",
    });

    expect(result?.latex).toBe(String.raw`c \int_{a}^{b} P \,\mathrm{d}{v}`);
  });

  it("keeps the sign inside a grouped product when extracting a selected negated factor value", () => {
    const document = buildDocument(String.raw`w = \int_{P_i}^{P_f} P \left(-v_0 \kappa \mathrm{d}{P}\right)`);
    const selectedNodeId = findNodeId(
      document,
      (expr) => expr.kind === "symbol" && expr.name === "v_0",
    );
    const destinationId = findNodeId(
      document,
      (expr) => expr.kind === "symbol" && expr.name === "P",
    );
    const result = executeMove({
      document,
      selection: { kind: "single", nodeId: selectedNodeId },
      destinationId,
      moveType: "multiplicative",
      destinationSlot: "after",
    });

    expect(result?.latex).toBe(String.raw`w = \int_{P_i}^{P_f} P v_0 \left(-\kappa \,\mathrm{d}{P}\right)`);
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
