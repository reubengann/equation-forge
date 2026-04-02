import { describe, expect, it } from "vitest";
import { mathPadFacade } from "../../application/mathPadFacade";
import { treefromLatex } from "../../testHelpers";
import { canDeclareFunction, declareFunction } from "./declareFunction";

describe("declareFunction", () => {
  it("converts a(t) to an Apply node", () => {
    const tree = treefromLatex(String.raw`a(t)`);
    const selection = { kind: "node", nodeId: tree.rootId } as const;

    expect(canDeclareFunction(tree, selection)).toBe(true);

    const next = declareFunction(tree, selection);
    expect(next).not.toBeNull();
    expect(next!.rootJson).toEqual(["Apply", "a", "t"]);
    expect(next!.nodesById[next!.rootId]?.op).toBe("Apply");
  });

  it("supports two-item multiplicative multi-selection", () => {
    const tree = treefromLatex(String.raw`a(t)`);
    const kids = tree.childrenById[tree.rootId] ?? [];
    expect(kids.length).toBe(2);

    const selection = { kind: "multi", nodeIds: [kids[0], kids[1]] } as const;
    expect(canDeclareFunction(tree, selection)).toBe(true);

    const next = declareFunction(tree, selection);
    expect(next).not.toBeNull();
    expect(next!.rootJson).toEqual(["Apply", "a", "t"]);
  });

  it("rejects ambiguous multiplicative chains like a b(t)", () => {
    const tree = treefromLatex(String.raw`a b(t)`);
    const selection = { kind: "node", nodeId: tree.rootId } as const;

    expect(canDeclareFunction(tree, selection)).toBe(false);
    expect(declareFunction(tree, selection)).toBeNull();
  });

  it("rejects non-atomic function arguments", () => {
    const tree = treefromLatex(String.raw`a(b+c)`);
    const selection = { kind: "node", nodeId: tree.rootId } as const;

    expect(canDeclareFunction(tree, selection)).toBe(false);
    expect(declareFunction(tree, selection)).toBeNull();
  });

  it("is exposed through mathPadFacade", () => {
    const tree = treefromLatex(String.raw`a(t)`);
    const selection = { kind: "node", nodeId: tree.rootId } as const;

    expect(mathPadFacade.canDeclareFunction(tree, selection)).toBe(true);
    const applied = mathPadFacade.applyAction({
      tree,
      selection,
      action: { type: "declareFunction" },
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.tree.rootJson).toEqual(["Apply", "a", "t"]);
  });
});

