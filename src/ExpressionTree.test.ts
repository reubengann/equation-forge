import { describe, it, expect } from "vitest";
import { ExpressionTree, type MJ } from "./ExpressionTree";
import { makeMJfromLatex, treefromLatex } from "./testHelpers";

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
      ["Differential", ["InvisibleOperator", "g", ["Delimiter", "x"]]],
      ["Differential", ["Power", "x", 2]],
    ]);
  });

  it("parses partial derivative fraction", () => {
    const mj = makeMJfromLatex(String.raw`\dfrac{\partial f}{\partial x}`);
    expect(mj).toEqual([
      "FractionPartialDerivative",
      ["Partial", "f"],
      ["Partial", "x"],
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

  it("renders FractionPartialDerivative to partial-derivative LaTeX", () => {
    const t = ExpressionTree.create([
      "FractionPartialDerivative",
      ["Partial", "f"],
      ["Partial", ["Power", "x", 2]],
    ]);

    expect(t.latexPlain).toBe(String.raw`\frac{\partial{f}}{\partial{x^{2}}}`);
  });

  it("renders Integrate with bounds and differential", () => {
    const t = ExpressionTree.create([
      "Integrate",
      ["Power", "x", 2],
      ["Tuple", "x", 0, 5],
    ]);

    expect(t.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\int_{0}^{5} x^{2} \,\mathrm{d}{x}`.replace(/\s+/g, " ").trim()
    );
  });

  it("renders indefinite Integrate with differential", () => {
    const t = ExpressionTree.create([
      "Integrate",
      ["InvisibleOperator", "f", ["Delimiter", "x"]],
      "x",
    ]);

    expect(t.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\int f \left(x\right) \,\mathrm{d}{x}`
        .replace(/\s+/g, " ")
        .trim()
    );
  });

  it("renders integral with implicit integrand (blank)", () => {
    const t = treefromLatex(
      String.raw`v_{0}^{2} = 2 g \sin\left(\theta\right) \int_{0}^{x_{0}} \,\mathrm{d}{x}`
    );
    expect(t.latexPlain.replace(/\s+/g, " ").trim()).toContain(
      String.raw`2 g \sin\left(\theta\right) \int_{0}^{x_{0}} \,\mathrm{d}{x}`
        .replace(/\s+/g, " ")
        .trim()
    );
  });

  it("keeps FractionDerivative operands untagged internally for selection", () => {
    const t = ExpressionTree.create([
      "FractionDerivative",
      ["Differential", "f"],
      ["Differential", "x"],
    ]);
    // Should tag the fraction + each differential, but not inner f/x.
    expect(t.latexTagged).toContain(`node-id="n1"`);
    expect(t.latexTagged).toContain(`node-id="n2"`);
    expect(t.latexTagged).toContain(`node-id="n4"`);
    expect(t.latexTagged).not.toContain(`node-id="n3"`);
    expect(t.latexTagged).not.toContain(`node-id="n5"`);
  });

  it("keeps FractionPartialDerivative operands untagged internally for selection", () => {
    const t = ExpressionTree.create([
      "FractionPartialDerivative",
      ["Partial", "f"],
      ["Partial", "x"],
    ]);
    expect(t.latexTagged).toContain(`node-id="n1"`);
    expect(t.latexTagged).not.toContain(`node-id="n2"`);
    expect(t.latexTagged).not.toContain(`node-id="n3"`);
    expect(t.latexTagged).not.toContain(`node-id="n4"`);
    expect(t.latexTagged).not.toContain(`node-id="n5"`);
  });

  it("keeps ordinary dfrac as Divide", () => {
    const mj = makeMJfromLatex(String.raw`\dfrac{a}{b}`);
    expect(mj).toEqual(["Divide", "a", "b"]);
  });

  it("does not treat partial differential as FractionDerivative", () => {
    const mj = makeMJfromLatex(String.raw`\dfrac{\differentialD f}{b}`);
    expect(mj).toEqual(["Divide", ["Differential", "f"], "b"]);
  });

  it("parses standalone differentials in sums", () => {
    const mj = makeMJfromLatex(
      String.raw`\differentialD x + \differentialD y = \differentialD y`
    );
    expect(mj).toEqual([
      "Equal",
      ["Add", ["Differential", "x"], ["Differential", "y"]],
      ["Differential", "y"],
    ]);
  });

  it("does not inject InvisibleOperator into differential sums", () => {
    const mj = makeMJfromLatex(
      String.raw`\differentialD x + \differentialD y = \differentialD y`
    );
    const jsonStr = JSON.stringify(mj);
    expect(jsonStr).not.toContain("InvisibleOperator");
  });

  it("does not tag inside Differential (atomic selection)", () => {
    const t = ExpressionTree.create(["Differential", "f"]);
    expect(t.latexTagged).toBe(
      String.raw`\htmlData{node-id="n1"}{\mathrm{d}{f}}`
    );
    expect(t.latexTagged).not.toContain(`node-id="n2"`);
  });

  it("does not tag inside Partial (atomic selection)", () => {
    const t = ExpressionTree.create(["Partial", ["Power", "x", 2]]);
    expect(t.latexTagged).toBe(
      String.raw`\htmlData{node-id="n1"}{\partial{x^{2}}}`
    );
    expect(t.latexTagged).not.toContain(`node-id="n2"`);
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

  it("renders DotProduct with a centered dot", () => {
    const mj: MJ = ["DotProduct", ["Vector", "a"], ["Vector", "b"]];
    const t = ExpressionTree.create(mj);

    expect(t.latexPlain).toBe(String.raw`\vec{a} \cdot \vec{b}`);
    expect(t.latexTagged).toContain(String.raw`\cdot`);
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

  it("renders Vector (normalized) as \\vec{...}", () => {
    const mj: MJ = ["OverVector", "v"];
    const t = ExpressionTree.create(mj);

    expect(t.latexPlain).toBe(String.raw`\vec{v}`);
    expect(Object.values(t.nodesById).some((n) => n.op === "Vector")).toBe(true);
  });

  it("renders OverVector over a grouped expression", () => {
    const mj: MJ = ["OverVector", ["Delimiter", ["Add", "a", "b"]]];
    const t = ExpressionTree.create(mj);

    expect(t.latexPlain).toContain(String.raw`\vec{`);
  });

  it("renders Sin with implicit argument", () => {
    const t = ExpressionTree.create(makeMJfromLatex(String.raw`\sin x`));
    expect(t.latexPlain).toBe(String.raw`\sin\left(x\right)`);
  });

  it("renders inverse tangent", () => {
    const t = treefromLatex(String.raw`\tan^{-1} x`);
    expect(t.latexPlain).toBe(String.raw`\tan^{-1}\left(x\right)`);
  });

  it("renders a Degrees operand as a degree symbol", () => {
    const t = ExpressionTree.create(["Sin", ["Degrees", 30]]);
    expect(t.latexPlain).toBe(String.raw`\sin\left(30^{\circ}\right)`);
    const degreesNode = Object.values(t.nodesById).find(
      (n) => n.op === "Degrees"
    );
    expect(degreesNode?.latex).toBe(String.raw`30^{\circ}`);
  });

  it("renders Cos of a sum with parens", () => {
    const t = ExpressionTree.create(makeMJfromLatex(String.raw`\cos(a+b)`));
    expect(t.latexPlain).toBe(String.raw`\cos\left(a + b\right)`);
  });

  it("renders Exp as \\exp()", () => {
    const t = ExpressionTree.create(makeMJfromLatex(String.raw`\exp(a+b)`));
    expect(t.latexPlain).toBe(String.raw`\exp\left(a + b\right)`);
  });

  it("renders InvisibleOperator Exp x as function call", () => {
    const t = ExpressionTree.create(makeMJfromLatex(String.raw`\exp x`));
    expect(t.latexPlain).toBe(String.raw`\exp\left(x\right)`);
  });

  it("renders Abs with vertical bars", () => {
    const t = ExpressionTree.create(["Abs", ["Add", "a", "b"]]);
    expect(t.latexPlain).toBe(String.raw`\left|a + b\right|`);
  });

  it("renders Greek lowercase symbol names as macros", () => {
    const t = ExpressionTree.create(["Add", "rho", "alpha"]);
    expect(t.latexPlain).toBe(String.raw`\rho + \alpha`);
  });

  it("renders Greek uppercase symbol names as macros", () => {
    const t = ExpressionTree.create(["Add", "Gamma", "Omega"]);
    expect(t.latexPlain).toBe(String.raw`\Gamma + \Omega`);
  });

  it("round-trips Greek LaTeX through parse and render", () => {
    const t = treefromLatex(String.raw`\rho + \Gamma`);
    expect(t.latexPlain).toBe(String.raw`\rho + \Gamma`);
  });
});
