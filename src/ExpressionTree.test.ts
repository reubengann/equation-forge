import { describe, it, expect } from "vitest";
import { ExpressionTree, type MJ } from "./ExpressionTree";
import { makeMJfromLatex } from "./testHelpers";

describe("ExpressionTree", () => {
  it("Wraps each node", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b = c + d"));
    expect(t.latexTagged).toBe(
      String.raw`\htmlData{node-id="n1"}{\htmlData{node-id="n2"}{\htmlData{node-id="n3"}{a} + \htmlData{node-id="n4"}{b}} = \htmlData{node-id="n5"}{\htmlData{node-id="n6"}{c} + \htmlData{node-id="n7"}{d}}}`
    );
  });

  it("Has the correct number of nodesById", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b = c + d"));
    expect(Object.keys(t.nodesById).length).toBe(7);
  });

  it("Can parse a sum", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b"));
    expect(t.latexTagged).toBe(
      String.raw`\htmlData{node-id="n1"}{\htmlData{node-id="n2"}{a} + \htmlData{node-id="n3"}{b}}`
    );
  });

  it("renders Power and wraps additive base", () => {
    const t1 = ExpressionTree.create(["Power", "x", 2]);
    expect(t1.latexPlain).toBe(String.raw`x^{2}`);

    const t2 = ExpressionTree.create(["Power", ["Add", "a", "b"], 2]);
    expect(t2.latexPlain.replace(/\s+/g, "")).toBe(
      String.raw`\left(a+b\right)^{2}`
    );
  });

  it("renders Subscript", () => {
    const t = ExpressionTree.create(["Subscript", "v", "x"]);
    expect(t.latexPlain).toBe(String.raw`v_{x}`);
  });

  it("Can parse an equality", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a = b"));
    expect(t.latexTagged).toBe(
      String.raw`\htmlData{node-id="n1"}{\htmlData{node-id="n2"}{a} = \htmlData{node-id="n3"}{b}}`
    );
  });

  it("Builds parentById for an equality", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a = b"));

    // root has no parent
    expect(t.parentById["n1"]).toBe(null);

    // both sides of equality are children of root
    expect(t.parentById["n2"]).toBe("n1");
    expect(t.parentById["n3"]).toBe("n1");
  });

  it("Builds parentById for a sum", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b"));

    expect(t.parentById["n1"]).toBe(null);
    expect(t.parentById["n2"]).toBe("n1");
    expect(t.parentById["n3"]).toBe("n1");
  });

  it("Builds parentById for nested ops", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b = c + d"));

    expect(t.parentById["n1"]).toBe(null);

    // LHS Add and RHS Add are children of Equal
    expect(t.parentById["n2"]).toBe("n1");
    expect(t.parentById["n5"]).toBe("n1");

    // leaves are children of their Add
    expect(t.parentById["n3"]).toBe("n2");
    expect(t.parentById["n4"]).toBe("n2");
    expect(t.parentById["n6"]).toBe("n5");
    expect(t.parentById["n7"]).toBe("n5");
  });

  it("Builds childrenById for a sum", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b"));

    // root Add has two children: a, b
    expect(t.childrenById["n1"]).toEqual(["n2", "n3"]);

    // leaves have no children (either undefined or empty — pick one policy)
    expect(t.childrenById["n2"] ?? []).toEqual([]);
    expect(t.childrenById["n3"] ?? []).toEqual([]);
  });

  it("Builds childrenById for an equality", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a = b"));

    // root Equal has two children: L, R
    expect(t.childrenById["n1"]).toEqual(["n2", "n3"]);
  });

  it("Builds childrenById for nested ops", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b = c + d"));

    // Equal children are the two Add nodes
    expect(t.childrenById["n1"]).toEqual(["n2", "n5"]);

    // Each Add has its leaves
    expect(t.childrenById["n2"]).toEqual(["n3", "n4"]);
    expect(t.childrenById["n5"]).toEqual(["n6", "n7"]);
  });

  it("Builds childIndexById for a sum", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b"));

    // In root Add (n1): a is first, b is second
    expect(t.childIndexById["n2"]).toBe(0);
    expect(t.childIndexById["n3"]).toBe(1);
  });

  it("Builds childIndexById for nested sums", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b = c + d"));

    // In Equal (n1): LHS Add is first, RHS Add is second
    expect(t.childIndexById["n2"]).toBe(0);
    expect(t.childIndexById["n5"]).toBe(1);

    // In LHS Add (n2): a then b
    expect(t.childIndexById["n3"]).toBe(0);
    expect(t.childIndexById["n4"]).toBe(1);

    // In RHS Add (n5): c then d
    expect(t.childIndexById["n6"]).toBe(0);
    expect(t.childIndexById["n7"]).toBe(1);
  });

  it("Builds pathById for a sum", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b"));

    expect(t.pathById["n1"]).toEqual([]);
    expect(t.pathById["n2"]).toEqual([1]);
    expect(t.pathById["n3"]).toEqual([2]);
  });

  it("Builds pathById for an equality", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a = b"));

    expect(t.pathById["n1"]).toEqual([]);
    expect(t.pathById["n2"]).toEqual([1]);
    expect(t.pathById["n3"]).toEqual([2]);
  });

  it("Builds pathById for nested expressions", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b = c + d"));

    expect(t.pathById["n1"]).toEqual([]);

    expect(t.pathById["n2"]).toEqual([1]);
    expect(t.pathById["n3"]).toEqual([1, 1]);
    expect(t.pathById["n4"]).toEqual([1, 2]);

    expect(t.pathById["n5"]).toEqual([2]);
    expect(t.pathById["n6"]).toEqual([2, 1]);
    expect(t.pathById["n7"]).toEqual([2, 2]);
  });

  it("Builds idByPath for a sum", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b"));

    expect(t.idByPath[""]).toBe("n1"); // root []
    expect(t.idByPath["1"]).toBe("n2"); // a
    expect(t.idByPath["2"]).toBe("n3"); // b
  });

  it("Builds idByPath for nested expressions", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a + b = c + d"));

    expect(t.idByPath[""]).toBe("n1");

    expect(t.idByPath["1"]).toBe("n2");
    expect(t.idByPath["1.1"]).toBe("n3");
    expect(t.idByPath["1.2"]).toBe("n4");

    expect(t.idByPath["2"]).toBe("n5");
    expect(t.idByPath["2.1"]).toBe("n6");
    expect(t.idByPath["2.2"]).toBe("n7");
  });

  it('Does not turn the symbol "e" into \\exponentialE', () => {
    // This is intentionally *not* produced by makeMJfromLatex, which will always interpret an e to be \exponentialE :(
    const mj: MJ = ["Add", "e", "f"];
    const t = ExpressionTree.create(mj);

    expect(t.latexTagged).toBe(
      String.raw`\htmlData{node-id="n1"}{\htmlData{node-id="n2"}{e} + \htmlData{node-id="n3"}{f}}`
    );
    expect(t.latexTagged).not.toContain(`\\exponentialE`);
  });

  it("Renders Divide as a fraction", () => {
    const t = ExpressionTree.create(["Divide", ["Add", "a", "b"], 2]);
    expect(t.latexTagged).toBe(
      String.raw`\htmlData{node-id="n1"}{\frac{\htmlData{node-id="n2"}{\htmlData{node-id="n3"}{a} + \htmlData{node-id="n4"}{b}}}{\htmlData{node-id="n5"}{2}}}`
    );
  });

  it("parses derivative fraction into FractionDerivative", () => {
    const mj = makeMJfromLatex(
      String.raw`\dfrac{\differentialD f}{\differentialD x}`
    );
    expect(mj).toEqual([
      "FractionDerivative",
      ["Differential", "f"],
      ["Differential", "x"],
    ]);
  });

  it("parses derivative fraction with composite expressions", () => {
    const mj = makeMJfromLatex(
      String.raw`\dfrac{\differentialD g(x)}{\differentialD x^2}`
    );
    expect(mj).toEqual([
      "FractionDerivative",
      ["Differential", ["Multiply", "g", ["Delimiter", "x"]]],
      ["Differential", ["Power", "x", 2]],
    ]);
  });

  it("renders FractionDerivative to derivative-style LaTeX", () => {
    const t = ExpressionTree.create([
      "FractionDerivative",
      ["Differential", "f"],
      ["Differential", ["Power", "x", 2]],
    ]);

    expect(t.latexPlain).toBe(
      String.raw`\frac{\mathrm{d}{f}}{\mathrm{d}{x^{2}}}`
    );
  });

  it("keeps ordinary dfrac as Divide", () => {
    const mj = makeMJfromLatex(String.raw`\dfrac{a}{b}`);
    expect(mj).toEqual(["Divide", "a", "b"]);
  });

  it("Does not canonicalize commutative Add (b + a stays b + a)", () => {
    const mj: MJ = ["Add", "b", "a"];
    const t = ExpressionTree.create(mj);

    expect(t.latexTagged).toBe(
      String.raw`\htmlData{node-id="n1"}{\htmlData{node-id="n2"}{b} + \htmlData{node-id="n3"}{a}}`
    );
  });

  it("Renders InvisibleOperator with a thin space", () => {
    const mj: MJ = ["InvisibleOperator", "a", "b"];
    const t = ExpressionTree.create(mj);

    expect(t.latexTagged).toBe(
      String.raw`\htmlData{node-id="n1"}{\htmlData{node-id="n2"}{a}\,\htmlData{node-id="n3"}{b}}`
    );
  });

  it("renders Multiply as implicit multiplication (no dot)", () => {
    const mj: MJ = ["Multiply", "a", "b", "c"];
    const t = ExpressionTree.create(mj);

    expect(t.latexPlain).toBe(String.raw`a b c`);
    expect(t.latexTagged).toBe(
      String.raw`\htmlData{node-id="n1"}{\htmlData{node-id="n2"}{a}\,\htmlData{node-id="n3"}{b}\,\htmlData{node-id="n4"}{c}}`
    );
  });

  it("Renders subtraction as a - b (not a + -b)", () => {
    const t = ExpressionTree.create(makeMJfromLatex("a - b = c"));
    expect(t.latexTagged).toBe(
      String.raw`\htmlData{node-id="n1"}{\htmlData{node-id="n2"}{\htmlData{node-id="n3"}{a} - \htmlData{node-id="n5"}{b}} = \htmlData{node-id="n6"}{c}}`
    );

    // The "b" term is still represented by a Negate node in the tree.
    expect(t.nodesById["n4"].op).toBe("Negate");
    expect(t.childrenById["n4"]).toEqual(["n5"]);
  });

  it("renders Delimiter as parentheses", () => {
    const t = ExpressionTree.create(makeMJfromLatex("(a+b)"));
    expect(t.latexPlain).toContain(String.raw`\left(a + b\right)`);
    expect(Object.values(t.nodesById).some((n) => n.op === "Delimiter")).toBe(
      true
    );
  });

  it("renders List as square brackets", () => {
    const t = ExpressionTree.create(makeMJfromLatex("[a+b]"));
    expect(t.latexPlain).toContain(String.raw`\left[a + b\right]`);
    expect(Object.values(t.nodesById).some((n) => n.op === "List")).toBe(true);
  });

  it("renders Set as curly braces", () => {
    const mj: MJ = ["Set", ["Add", "a", "b"]];
    const t = ExpressionTree.create(mj);
    expect(t.latexPlain).toContain(String.raw`\left\{a + b\right\}`);
    expect(Object.values(t.nodesById).some((n) => n.op === "Set")).toBe(true);
  });

  it("renders Sequence as comma-separated", () => {
    const mj: MJ = ["Sequence", "a", "b"];
    const t = ExpressionTree.create(mj);

    expect(t.latexPlain).toBe("a, b");
    expect(Object.values(t.nodesById).some((n) => n.op === "Sequence")).toBe(
      true
    );
  });

  it("renders (a, b) as Delimiter(Sequence(...))", () => {
    const mj: MJ = ["Delimiter", ["Sequence", "a", "b"]];
    const t = ExpressionTree.create(mj);

    expect(t.latexPlain).toContain(String.raw`\left(a, b\right)`);
  });

  it("renders OverVector as \\vec{...}", () => {
    const mj: MJ = ["OverVector", "v"];
    const t = ExpressionTree.create(mj);

    expect(t.latexPlain).toBe(String.raw`\vec{v}`);
    expect(Object.values(t.nodesById).some((n) => n.op === "OverVector")).toBe(
      true
    );
  });

  it("renders OverVector over a grouped expression", () => {
    const mj: MJ = ["OverVector", ["Delimiter", ["Add", "a", "b"]]];
    const t = ExpressionTree.create(mj);

    expect(t.latexPlain).toContain(String.raw`\vec{`);
  });
});
