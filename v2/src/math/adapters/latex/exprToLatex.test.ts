import { describe, expect, it } from "vitest";
import { parseLatexToExpr } from "./parseLatexToExpr";
import { exprToLatex } from "./exprToLatex";
import { compileMathDocumentFromExpr } from "../../compile/compileMathDocument";

describe("exprToLatex", () => {
  it("wraps number in tags", () => {
    const expr = parseLatexToExpr("4");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe('\\htmlData{node-id="n1"}{4}');
  });

  it("wraps number in tags 2", () => {
    const expr = parseLatexToExpr("24.7");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe('\\htmlData{node-id="n1"}{24.7}');
  });

  it("wraps symbol in tags", () => {
    const expr = parseLatexToExpr("x");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe('\\htmlData{node-id="n1"}{x}');
  });

  it("wraps sum", () => {
    const expr = parseLatexToExpr("a + b");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\htmlData{node-id="n2"}{a} + \\htmlData{node-id="n3"}{b}}',
    );
  });

  it("can generate without tags", () => {
    const expr = parseLatexToExpr("a + b");
    const latex = exprToLatex(expr, false);
    expect(latex).toBe("a + b");
  });

  it("prints subtraction notation in sums", () => {
    const expr = parseLatexToExpr("c-a");
    const latex = exprToLatex(expr, false);
    expect(latex).toBe("c - a");
  });

  it("preserves explicit prefix negation in sums", () => {
    const expr = parseLatexToExpr("c + -a");
    const latex = exprToLatex(expr, false);
    expect(latex).toBe("c + -a");
  });

  it("wraps product", () => {
    const expr = parseLatexToExpr("a b");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\htmlData{node-id="n2"}{a} \\htmlData{node-id="n3"}{b}}',
    );
  });

  /* 
  \\htmlData{node-id="n1"}{\\htmlData{node-id="n2"}{a}^{\\htmlData{node-id="n3"}{b}}}
  At the end are three closing braces:
  First } is for closing the argument of htmlData (n3)
  Second } is for the exponent a^{...} including the node-id
  Third } is for the overall power node (n1)
  */
  it("wraps power", () => {
    const expr = parseLatexToExpr("a^b");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\htmlData{node-id="n2"}{a}^{\\htmlData{node-id="n3"}{b}}}',
    );
  });

  it("wraps power without tags but does wrap with braces", () => {
    const expr = parseLatexToExpr("a^b");
    const latex = exprToLatex(expr, false);
    expect(latex).toBe("a^{b}");
  });

  it("wraps negate", () => {
    const expr = parseLatexToExpr("-a");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{-\\htmlData{node-id="n2"}{a}}',
    );
  });

  it("wraps divide as fraction", () => {
    const expr = parseLatexToExpr("a / b");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\frac{\\htmlData{node-id="n2"}{a}}{\\htmlData{node-id="n3"}{b}}}',
    );
  });

  /*
  \\htmlData{node-id="n1"}{
    \\sqrt{
        \\htmlData{node-id="n2"}{
            \\htmlData{node-id="n3"}{a} + \\htmlData{node-id="n4"}{b}
        }
     }
   }
  */
  it("wraps sqrt", () => {
    const expr = parseLatexToExpr(String.raw`\sqrt{a + b}`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\sqrt{\\htmlData{node-id="n2"}{\\htmlData{node-id="n3"}{a} + \\htmlData{node-id="n4"}{b}}}}',
    );
  });

  it("wraps sqrt with degree", () => {
    const expr = parseLatexToExpr(String.raw`\sqrt[3]{a + b}`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\sqrt[3]{\\htmlData{node-id="n2"}{\\htmlData{node-id="n3"}{a} + \\htmlData{node-id="n4"}{b}}}}',
    );
  });

  it("wraps equation", () => {
    const expr = parseLatexToExpr(String.raw`a = b`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\htmlData{node-id="n2"}{a} = \\htmlData{node-id="n3"}{b}}',
    );
  });

  it("wraps inequality", () => {
    const expr = parseLatexToExpr(String.raw`a < b`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\htmlData{node-id="n2"}{a} < \\htmlData{node-id="n3"}{b}}',
    );
  });

  it("converts call with proper delimiter", () => {
    for (const [input, expected] of [
      [
        String.raw`\sin(x)`,
        String.raw`\htmlData{node-id="n1"}{\sin\left(\htmlData{node-id="n3"}{x}\right)}`,
      ],
      [
        String.raw`\cos x`,
        String.raw`\htmlData{node-id="n1"}{\cos \htmlData{node-id="n3"}{x}} `,
      ],
      [
        String.raw`\tan[x]`,
        String.raw`\htmlData{node-id="n1"}{\tan\left[\htmlData{node-id="n3"}{x}\right]}`,
      ],
    ]) {
      const expr = parseLatexToExpr(input);
      const latex = exprToLatex(expr, true);
      expect(latex).toBe(expected);
    }
  });

  it("prints trig powers before the argument", () => {
    const expr = parseLatexToExpr(String.raw`\sin^2x+\cos^2x`);
    const latex = exprToLatex(expr, false);

    expect(latex).toBe(String.raw`\sin^{2} x + \cos^{2} x`);
  });

  it("keeps tagged trig power ids aligned with compiled index ids", () => {
    const expr = parseLatexToExpr(String.raw`\sin^{2}\left(x+y\right)+\cos^{2}\left(x+y\right)`);
    const latex = exprToLatex(expr, true);
    const doc = compileMathDocumentFromExpr(String.raw`\sin^{2}\left(x+y\right)+\cos^{2}\left(x+y\right)`, expr);
    const cosPowerNodeId = Object.entries(doc.index.nodeById).find(([, node]) => {
      if (node.kind !== "power" || node.base.kind !== "call") return false;
      return node.base.callee.kind === "symbol" && node.base.callee.name === "cos";
    })?.[0];

    expect(cosPowerNodeId).toBeTruthy();
    expect(latex).toContain(String.raw`\htmlData{node-id="${cosPowerNodeId}"}{\cos^`);
  });

  it("keeps tagged call ids aligned with compiled index ids", () => {
    const expr = parseLatexToExpr(String.raw`5-2\left(5+3\right)=\sin\pi`);
    const latex = exprToLatex(expr, true);
    const doc = compileMathDocumentFromExpr(String.raw`5-2\left(5+3\right)=\sin\pi`, expr);
    const callNodeId = Object.entries(doc.index.nodeById).find(
      ([, node]) => node.kind === "call",
    )?.[0];
    const piNodeId = Object.entries(doc.index.nodeById).find(
      ([, node]) => node.kind === "symbol" && node.name === String.raw`\pi`,
    )?.[0];

    expect(callNodeId).toBeTruthy();
    expect(piNodeId).toBeTruthy();
    expect(latex).toContain(
      String.raw`\htmlData{node-id="${callNodeId}"}{\sin \htmlData{node-id="${piNodeId}"}{\pi}}`,
    );
  });

  it("converts text", () => {
    const expr = parseLatexToExpr(String.raw`a = \text{const.}`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\htmlData{node-id="n2"}{a} = \\htmlData{node-id="n3"}{\\text{const.}}}',
    );
  });

  it("converts absolute value", () => {
    const expr = parseLatexToExpr(String.raw`|a|`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{|\\htmlData{node-id="n2"}{a}|}',
    );
  });

  it("converts vector", () => {
    const expr = parseLatexToExpr(String.raw`\vec{a}`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\vec{\\htmlData{node-id="n2"}{a}}}',
    );
  });

  it("converts hat", () => {
    const expr = parseLatexToExpr(String.raw`\hat{a}`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      '\\htmlData{node-id="n1"}{\\hat{\\htmlData{node-id="n2"}{a}}}',
    );
  });

  it("converts dot product", () => {
    const expr = parseLatexToExpr(String.raw`\vec{v} \cdot b \vec{w}`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      String.raw`\htmlData{node-id="n1"}{\htmlData{node-id="n2"}{\vec{\htmlData{node-id="n3"}{v}}} \cdot \htmlData{node-id="n4"}{\htmlData{node-id="n5"}{b} \htmlData{node-id="n6"}{\vec{\htmlData{node-id="n7"}{w}}}}}`,
    );
  });

  it("converts cross product", () => {
    const expr = parseLatexToExpr(String.raw`\vec{v} \times b \vec{w}`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      String.raw`\htmlData{node-id="n1"}{\htmlData{node-id="n2"}{\vec{\htmlData{node-id="n3"}{v}}} \times \htmlData{node-id="n4"}{\htmlData{node-id="n5"}{b} \htmlData{node-id="n6"}{\vec{\htmlData{node-id="n7"}{w}}}}}`,
    );
  });

  it("converts dotted expression", () => {
    const expr = parseLatexToExpr(String.raw`\dot{x}`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      String.raw`\htmlData{node-id="n1"}{\dot{\htmlData{node-id="n2"}{x}}}`,
    );
  });

  it("convert primed expression", () => {
    const expr = parseLatexToExpr(String.raw`x'`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      String.raw`\htmlData{node-id="n1"}{\htmlData{node-id="n2"}{x}'}`,
    );
  });

  it("converts script font", () => {
    const expr = parseLatexToExpr(String.raw`\mathscr{A}`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      String.raw`\htmlData{node-id="n1"}{\mathscr{\htmlData{node-id="n2"}{A}}}`,
    );
  });

  it("converts calligraphic font", () => {
    const expr = parseLatexToExpr(String.raw`\mathcal{A}`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      String.raw`\htmlData{node-id="n1"}{\mathcal{\htmlData{node-id="n2"}{A}}}`,
    );
  });

  it("converts blackboard font", () => {
    const expr = parseLatexToExpr(String.raw`\mathbb{A}`);
    const latex = exprToLatex(expr, true);
    expect(latex).toBe(
      String.raw`\htmlData{node-id="n1"}{\mathbb{\htmlData{node-id="n2"}{A}}}`,
    );
  });

  it("converts big sum without tags", () => {
    const expr = parseLatexToExpr(String.raw`\sum_{i=1}^{n} x_i`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe(String.raw`\sum_{1}^{n} x_i`);
  });

  it("converts big product without tags", () => {
    const expr = parseLatexToExpr(String.raw`\prod_{i=1}^{n} x_i`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe(String.raw`\prod_{1}^{n} x_i`);
  });

  it("converts integral with bounds without tags", () => {
    const expr = parseLatexToExpr(String.raw`\int_{0}^{x} a \,\mathrm{d}{x}`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe(String.raw`\int_{0}^{x} a \,\mathrm{d}{x}`);
  });

  it("converts uniterated integral without tags", () => {
    const expr = parseLatexToExpr(String.raw`\int ds`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe(String.raw`\int \mathrm{d}{s}`);
  });

  it("converts closed and multiple integrals without tags", () => {
    const closedExpr = parseLatexToExpr(String.raw`\oint ds`);
    const multipleExpr = parseLatexToExpr(String.raw`\iint ds`);
    expect(exprToLatex(closedExpr, false)).toBe(
      String.raw`\oint \mathrm{d}{s}`,
    );
    expect(exprToLatex(multipleExpr, false)).toBe(
      String.raw`\int\int \mathrm{d}{s}`,
    );
  });

  it("converts differential and partial derivative without tags", () => {
    const differentialExpr = parseLatexToExpr(String.raw`dx`);
    const partialExpr = parseLatexToExpr(
      String.raw`\frac{\partial{s}}{\partial{T}}`,
    );
    expect(exprToLatex(differentialExpr, false)).toBe(
      String.raw`\mathrm{d}{x}`,
    );
    expect(exprToLatex(partialExpr, false)).toBe(
      String.raw`\frac{\partial{s}}{\partial{T}}`,
    );
  });

  it("converts display groups without tags", () => {
    const expr = parseLatexToExpr(String.raw`(a+b)`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe(String.raw`\left(a + b\right)`);
  });

  it("wraps display group delimiters with the group node id", () => {
    const expr = parseLatexToExpr(String.raw`\frac{\left(1 + \cos\left(2 x\right)\right)}{2}`);
    const latex = exprToLatex(expr, true);
    const doc = compileMathDocumentFromExpr(String.raw`\frac{\left(1 + \cos\left(2 x\right)\right)}{2}`, expr);
    const numeratorGroupId = Object.entries(doc.index.nodeById).find(([, node]) => node.kind === "display_group")?.[0];

    expect(numeratorGroupId).toBeTruthy();
    expect(latex).toContain(String.raw`\htmlData{node-id="${numeratorGroupId}"}{\left(`);
  });

  it("converts second-order partial and partial-at-constant without tags", () => {
    const secondOrderExpr = parseLatexToExpr(
      String.raw`\frac{\partial^{2}{s}}{\partial{P} \partial{T}}`,
    );
    const atConstExpr = parseLatexToExpr(
      String.raw`\left(\frac{\partial{s}}{\partial{T}}\right)_{P}`,
    );
    expect(exprToLatex(secondOrderExpr, false)).toBe(
      String.raw`\frac{\partial^{2}{s}}{\partial{P} \partial{T}}`,
    );
    expect(exprToLatex(atConstExpr, false)).toBe(
      String.raw`\left(\frac{\partial{s}}{\partial{T}}\right)_{P}`,
    );
  });

  it("passes through immutable input and rejects invalid input", () => {
    const immutable = parseLatexToExpr("");
    const invalid = parseLatexToExpr(String.raw`\frac{a + b}{c + d`);
    expect(exprToLatex(immutable, false)).toBe("");
    expect(() => exprToLatex(invalid, false)).toThrow(
      String.raw`Invalid input: \frac{a + b}{c + d`,
    );
  });

  it("converts derivative operators without tags", () => {
    const full = parseLatexToExpr(String.raw`\frac{d}{dx} f g`);
    const partial = parseLatexToExpr(
      String.raw`\frac{\partial}{\partial x} f`,
    );
    expect(exprToLatex(full, false)).toBe(
      String.raw`\frac{\mathrm{d}}{\mathrm{d}{x}} f g`,
    );
    expect(exprToLatex(partial, false)).toBe(
      String.raw`\frac{\partial}{\partial{x}} f`,
    );
  });

  it("round-trips Delta x symbol without tags", () => {
    const expr = parseLatexToExpr(String.raw`\Delta x`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe(String.raw`\Delta x`);
  });

  it("round-trips Greek symbol macros without tags", () => {
    const expr = parseLatexToExpr(String.raw`\rho`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe(String.raw`\rho`);
  });

  it("round-trips limits without tags", () => {
    const expr = parseLatexToExpr(String.raw`\lim_{x \to 0} \frac{\sin x}{x}`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe(String.raw`\lim_{x \to 0} \frac{\sin x }{x}`);
  });
});
