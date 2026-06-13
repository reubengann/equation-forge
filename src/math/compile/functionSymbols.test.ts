import { describe, expect, it } from "vitest";
import { exprToLatex } from "../adapters/latex";
import { compileMathDocument, compileMathDocumentFromExpr } from "./compileMathDocument";
import {
  applyFunctionSymbolSemantics,
  canToggleFunctionSymbol,
  functionSymbolApplicationNodeIds,
  getFunctionSymbolCandidate,
  remapFunctionSymbols,
  toggleFunctionSymbol,
} from "./functionSymbols";
import {
  applyIdentityRewriteToSelection,
  getApplicableIdentityRewritesForSelection,
} from "../rewrite/identity";

function symbolNodeId(document: ReturnType<typeof compileMathDocument>, name: string): string {
  const entry = Object.entries(document.index.nodeById).find(
    ([, expr]) => expr.kind === "symbol" && expr.name === name,
  );
  if (!entry) throw new Error(`Missing symbol ${name}`);
  return entry[0];
}

function symbolNodeIds(document: ReturnType<typeof compileMathDocument>, name: string): string[] {
  return Object.entries(document.index.nodeById).flatMap(([nodeId, expr]) =>
    expr.kind === "symbol" && expr.name === name ? [nodeId] : [],
  );
}

function powerNodeId(document: ReturnType<typeof compileMathDocument>): string {
  const entry = Object.entries(document.index.nodeById).find(([, expr]) => expr.kind === "power");
  if (!entry) throw new Error("Missing power node");
  return entry[0];
}

describe("function symbol metadata", () => {
  it("allows symbol-like selections followed by parenthesized display groups", () => {
    const document = compileMathDocument(String.raw`f\left(x\right)+g\left(x, y\right)`);

    const fNodeId = symbolNodeId(document, "f");
    const gNodeId = symbolNodeId(document, "g");

    expect(getFunctionSymbolCandidate(document, fNodeId)).toEqual({ nodeId: fNodeId, name: "f" });
    expect(getFunctionSymbolCandidate(document, gNodeId)).toEqual({ nodeId: gNodeId, name: "g" });
  });

  it("rejects selections without a following parenthesized display group", () => {
    const noGroup = compileMathDocument(String.raw`f x`);
    const bracketGroup = compileMathDocument(String.raw`f\left[x\right]`);

    expect(canToggleFunctionSymbol(noGroup, symbolNodeId(noGroup, "f"))).toBe(false);
    expect(canToggleFunctionSymbol(bracketGroup, symbolNodeId(bracketGroup, "f"))).toBe(false);
  });

  it("re-parses tagged function applications as atomic user function nodes", () => {
    const document = compileMathDocument(String.raw`h\left(x+2, f\left(y\right)\right)`);
    const functionSymbols = toggleFunctionSymbol(document, [], symbolNodeId(document, "h"));
    const semanticExpr = applyFunctionSymbolSemantics(document, functionSymbols);

    expect(exprToLatex(semanticExpr, false)).toBe(String.raw`h\left(x + 2 , f \left(y\right)\right)`);
    expect(semanticExpr).toMatchObject({
      kind: "user_function",
      name: "h",
    });
  });

  it("returns every node in the tagged function application for styling", () => {
    const document = compileMathDocument(String.raw`f\left(x+1\right)+y`);
    const functionSymbols = toggleFunctionSymbol(document, [], symbolNodeId(document, "f"));
    const applicationNodeIds = functionSymbolApplicationNodeIds(document, functionSymbols);

    expect(applicationNodeIds.has(symbolNodeId(document, "f"))).toBe(true);
    expect(applicationNodeIds.has(symbolNodeId(document, "x"))).toBe(true);
    expect(applicationNodeIds.has(symbolNodeId(document, "y"))).toBe(false);
  });

  it("does not include a following product factor when styling compiled user functions", () => {
    const parsedDocument = compileMathDocument(String.raw`f\left(x\right)x`);
    const functionSymbols = toggleFunctionSymbol(parsedDocument, [], symbolNodeId(parsedDocument, "f"));
    const semanticDocument = compileMathDocumentFromExpr(
      parsedDocument.sourceLatex,
      applyFunctionSymbolSemantics(parsedDocument, functionSymbols),
    );
    const remappedFunctionSymbols = remapFunctionSymbols(parsedDocument, semanticDocument, functionSymbols);
    const applicationNodeIds = functionSymbolApplicationNodeIds(semanticDocument, remappedFunctionSymbols);
    const outsideXNodeId = Object.entries(semanticDocument.index.nodeById).find(
      ([, expr]) => expr.kind === "symbol" && expr.name === "x",
    )?.[0];

    expect(outsideXNodeId).toBeDefined();
    expect(applicationNodeIds.has(outsideXNodeId!)).toBe(false);
  });

  it("compiles tagged functions as one selectable node", () => {
    const document = compileMathDocument(String.raw`a\left(x\right)+b`);
    const functionSymbols = toggleFunctionSymbol(document, [], symbolNodeId(document, "a"));
    const semanticExpr = applyFunctionSymbolSemantics(document, functionSymbols);
    const semanticDocument = compileMathDocumentFromExpr(document.sourceLatex, semanticExpr);
    const functionEntry = Object.entries(semanticDocument.index.nodeById).find(
      ([, expr]) => expr.kind === "user_function" && expr.name === "a",
    );

    expect(functionEntry).toBeDefined();
    expect(semanticDocument.index.childrenById[functionEntry![0]]).toHaveLength(1);
    expect(Object.values(semanticDocument.index.nodeById).some((expr) => expr.kind === "symbol" && expr.name === "x")).toBe(true);
  });

  it("recognizes powered parenthesized arguments as powers of tagged functions", () => {
    const document = compileMathDocument(String.raw`f\left(x\right)^{2}+x`);
    const functionSymbols = toggleFunctionSymbol(document, [], symbolNodeId(document, "f"));
    const semanticDocument = compileMathDocumentFromExpr(
      document.sourceLatex,
      applyFunctionSymbolSemantics(document, functionSymbols),
    );
    const powerEntry = Object.entries(semanticDocument.index.nodeById).find(
      ([, expr]) => expr.kind === "power" && expr.base.kind === "user_function" && expr.base.name === "f",
    );

    expect(powerEntry).toBeDefined();
    expect(exprToLatex(semanticDocument.expr, false)).toBe(String.raw`f\left(x\right)^{2} + x`);
  });

  it("allows toggling powered tagged functions from the function node", () => {
    const document = compileMathDocument(String.raw`f\left(x\right)^{2}+x`);
    const functionSymbols = toggleFunctionSymbol(document, [], symbolNodeId(document, "f"));
    const semanticDocument = compileMathDocumentFromExpr(
      document.sourceLatex,
      applyFunctionSymbolSemantics(document, functionSymbols),
    );
    const functionNodeId = Object.entries(semanticDocument.index.nodeById).find(
      ([, expr]) => expr.kind === "user_function" && expr.name === "f",
    )?.[0];

    expect(functionNodeId).toBeDefined();
    expect(canToggleFunctionSymbol(semanticDocument, functionNodeId!)).toBe(true);
    expect(toggleFunctionSymbol(semanticDocument, functionSymbols, functionNodeId!)).toEqual([]);
  });

  it("untoggles every same-name function when any compiled function instance is selected", () => {
    const document = compileMathDocument(String.raw`f\left(x\right)+f\left(y\right)`);
    const functionSymbols = toggleFunctionSymbol(document, [], symbolNodeId(document, "f"));
    const semanticDocument = compileMathDocumentFromExpr(
      document.sourceLatex,
      applyFunctionSymbolSemantics(document, functionSymbols),
    );
    const firstUserFunctionId = Object.entries(semanticDocument.index.nodeById).find(
      ([, expr]) => expr.kind === "user_function" && expr.name === "f" && expr.argument.kind === "symbol" && expr.argument.name === "x",
    )?.[0];

    expect(firstUserFunctionId).toBeDefined();
    expect(toggleFunctionSymbol(semanticDocument, functionSymbols, firstUserFunctionId!)).toEqual([]);
  });

  it("compiles every same-name application once a function symbol is tagged", () => {
    const document = compileMathDocument(String.raw`2 f\left(x\right)x+f\left(x\right)^{2}+x^{2}`);
    const functionSymbols = toggleFunctionSymbol(document, [], symbolNodeId(document, "f"));
    const semanticDocument = compileMathDocumentFromExpr(
      document.sourceLatex,
      applyFunctionSymbolSemantics(document, functionSymbols),
    );

    const userFunctionCount = Object.values(semanticDocument.index.nodeById).filter(
      (expr) => expr.kind === "user_function" && expr.name === "f",
    ).length;

    expect(userFunctionCount).toBe(2);
    expect(exprToLatex(semanticDocument.expr, false)).toBe(String.raw`2 f\left(x\right) x + f\left(x\right)^{2} + x^{2}`);
  });

  it("remaps tags across accept when the same function application remains", () => {
    const previousDocument = compileMathDocument(String.raw`f\left(x\right)+y`);
    const nextDocument = compileMathDocument(String.raw`f\left(x\right)+z`);
    const functionSymbols = toggleFunctionSymbol(previousDocument, [], symbolNodeId(previousDocument, "f"));

    expect(remapFunctionSymbols(previousDocument, nextDocument, functionSymbols)).toEqual([
      { nodeId: symbolNodeId(nextDocument, "f"), name: "f" },
    ]);
  });

  it("remaps tags after reorder when the same function application moves", () => {
    const previousDocument = compileMathDocument(String.raw`f\left(x\right)+x`);
    const nextDocument = compileMathDocument(String.raw`x+f\left(x\right)`);
    const functionSymbols = toggleFunctionSymbol(previousDocument, [], symbolNodeId(previousDocument, "f"));

    expect(remapFunctionSymbols(previousDocument, nextDocument, functionSymbols)).toEqual([
      { nodeId: symbolNodeId(nextDocument, "f"), name: "f" },
    ]);
  });

  it("keeps the selected occurrence when remapping identical same-name functions after reorder", () => {
    const previousDocument = compileMathDocument(String.raw`f\left(x\right)+a+f\left(x\right)`);
    const nextDocument = compileMathDocument(String.raw`f\left(x\right)+f\left(x\right)+a`);
    const [, secondFunctionId] = symbolNodeIds(previousDocument, "f");
    if (!secondFunctionId) throw new Error("Expected second f symbol");
    const functionSymbols = toggleFunctionSymbol(previousDocument, [], secondFunctionId);
    const remapped = remapFunctionSymbols(previousDocument, nextDocument, functionSymbols);
    const nextFunctionIds = symbolNodeIds(nextDocument, "f");

    expect(remapped).toEqual([{ nodeId: nextFunctionIds[1], name: "f" }]);
  });

  it("prevents power-of-product from expanding tagged function applications", () => {
    const displayDocument = compileMathDocument(String.raw`\left(f\left(x\right)\right)^{2}`);
    const functionSymbols = toggleFunctionSymbol(displayDocument, [], symbolNodeId(displayDocument, "f"));
    const semanticExpr = applyFunctionSymbolSemantics(displayDocument, functionSymbols);
    const semanticDocument = compileMathDocumentFromExpr(displayDocument.sourceLatex, semanticExpr);
    const selection = { kind: "single" as const, nodeId: powerNodeId(semanticDocument) };

    expect(getApplicableIdentityRewritesForSelection(semanticDocument, selection).map((option) => option.id)).not.toContain(
      "power-of-product",
    );
    expect(applyIdentityRewriteToSelection(semanticDocument, selection, "power-of-product")).toBeNull();
  });

  it("preserves the sign of a tagged callee when rebuilding function nodes", () => {
    const document = compileMathDocument(String.raw`-f\left(x\right)-x`);
    const functionSymbols = toggleFunctionSymbol(document, [], symbolNodeId(document, "f"));
    const semanticExpr = applyFunctionSymbolSemantics(document, functionSymbols);

    expect(exprToLatex(semanticExpr, false)).toBe(String.raw`-f\left(x\right) - x`);
  });
});
