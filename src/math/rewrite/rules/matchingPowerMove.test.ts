import { describe, expect, it } from "vitest";
import { exprToLatex, parseLatexToExpr } from "../../adapters/latex";
import type { Expr } from "../../ast";
import { compileMathDocumentFromExpr, type CompiledMathDocument } from "../../compile/compileMathDocument";
import { extractFactorFromMatchingPower } from "./extractFactorFromMatchingPower";
import { insertFactorIntoMatchingPower } from "./insertFactorIntoMatchingPower";
import { enclosingPowerContainer } from "./samePowerContainers";

function buildDocument(latex: string): CompiledMathDocument {
  const expr = parseLatexToExpr(latex);
  return compileMathDocumentFromExpr(latex, expr);
}

function findNodeId(document: CompiledMathDocument, predicate: (expr: Expr) => boolean): string {
  const entry = Object.entries(document.index.nodeById).find(([, expr]) => predicate(expr));
  expect(entry).toBeDefined();
  return entry![0];
}

function symbolId(document: CompiledMathDocument, name: string): string {
  return findNodeId(document, (expr) => expr.kind === "symbol" && expr.name === name);
}

describe("matching power move rules", () => {
  it("extracts an entire base as a payload and replaces its power with one", () => {
    const document = buildDocument(String.raw`a^3 b^3`);
    const sourceId = symbolId(document, "a");
    const destinationId = symbolId(document, "b");
    const source = enclosingPowerContainer(document, sourceId)!;
    const rule = extractFactorFromMatchingPower();
    const context = {
      document,
      selection: { kind: "single" as const, nodeId: sourceId },
      payload: null,
      destinationId,
    };
    const edge = {
      childId: source.innerId,
      parentId: source.id,
      childNode: document.index.nodeById[source.innerId]!,
      parentNode: source.node,
      isFinalUpwardEdge: false,
      pivotId: document.index.rootId,
    };

    expect(rule.canApply(context, edge)).toBe(true);
    const result = rule.apply(context, edge);
    expect(exprToLatex(result!.payload!, false)).toBe("a");
    expect(exprToLatex(result!.updatedNode!, false)).toBe("1");
  });

  it("carries an existing factor payload through a matching power", () => {
    const document = buildDocument(String.raw`\left(a x\right)^n b^n`);
    const sourceId = symbolId(document, "a");
    const destinationId = symbolId(document, "b");
    const source = enclosingPowerContainer(document, sourceId)!;
    const rule = extractFactorFromMatchingPower();
    const context = {
      document,
      selection: { kind: "single" as const, nodeId: sourceId },
      payload: { kind: "symbol", name: "a" } as Expr,
      destinationId,
    };
    const edge = {
      childId: source.innerId,
      parentId: source.id,
      childNode: document.index.nodeById[source.innerId]!,
      parentNode: source.node,
      isFinalUpwardEdge: false,
      pivotId: document.index.rootId,
    };

    const result = rule.apply(context, edge);
    expect(exprToLatex(result!.payload!, false)).toBe("a");
    expect(result?.updatedNode).toBeUndefined();
  });

  it("inserts an ordinary payload and a reciprocal inside matching powers", () => {
    const document = buildDocument(String.raw`a^3=b^3`);
    const sourceId = symbolId(document, "a");
    const destinationId = symbolId(document, "b");
    const destination = enclosingPowerContainer(document, destinationId)!;
    const rule = insertFactorIntoMatchingPower();
    const downContext = {
      sideId: destination.id,
      sideNode: destination.node,
      destinationId,
      destinationNode: document.index.nodeById[destinationId]!,
    };

    const productResult = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: sourceId },
        payload: { kind: "symbol", name: "a" },
        destinationId,
        destinationSlot: "before",
      },
      downContext,
    );
    expect(exprToLatex(productResult!.updatedNode!, false)).toBe(String.raw`\left(a b\right)^{3}`);

    const reciprocalResult = rule.apply(
      {
        document,
        selection: { kind: "single", nodeId: sourceId },
        payload: {
          kind: "divide",
          numerator: { kind: "number", value: 1 },
          denominator: { kind: "symbol", name: "a" },
        },
        destinationId,
        destinationSlot: "after",
      },
      downContext,
    );
    expect(exprToLatex(reciprocalResult!.updatedNode!, false)).toBe(
      String.raw`\left(\frac{b}{a}\right)^{3}`,
    );
  });

  it("rejects mismatched exponents and root degrees", () => {
    const powers = buildDocument(String.raw`a^3 b^2`);
    const powerSourceId = symbolId(powers, "a");
    const powerDestinationId = symbolId(powers, "b");
    const powerSource = enclosingPowerContainer(powers, powerSourceId)!;
    const extractionRule = extractFactorFromMatchingPower();

    expect(
      extractionRule.canApply(
        {
          document: powers,
          selection: { kind: "single", nodeId: powerSourceId },
          payload: null,
          destinationId: powerDestinationId,
        },
        {
          childId: powerSource.innerId,
          parentId: powerSource.id,
          childNode: powers.index.nodeById[powerSource.innerId]!,
          parentNode: powerSource.node,
          isFinalUpwardEdge: false,
          pivotId: powers.index.rootId,
        },
      ),
    ).toBe(false);

    const roots = buildDocument(String.raw`\sqrt{a}\sqrt[3]{b}`);
    const rootSourceId = symbolId(roots, "a");
    const rootDestinationId = symbolId(roots, "b");
    const rootSource = enclosingPowerContainer(roots, rootSourceId)!;
    expect(
      extractionRule.canApply(
        {
          document: roots,
          selection: { kind: "single", nodeId: rootSourceId },
          payload: null,
          destinationId: rootDestinationId,
        },
        {
          childId: rootSource.innerId,
          parentId: rootSource.id,
          childNode: roots.index.nodeById[rootSource.innerId]!,
          parentNode: rootSource.node,
          isFinalUpwardEdge: false,
          pivotId: roots.index.rootId,
        },
      ),
    ).toBe(false);
  });
});
