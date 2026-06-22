import { describe, expect, it } from "vitest";
import { parseLatexToExpr } from "./parseLatexToExpr";
import { userFunction, sym } from "../../ast";
import { exprToLatex } from "./exprToLatex";
import { compileMathDocumentFromExpr } from "../../compile/compileMathDocument";
import type { Expr } from "../../ast";

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

  it("prints prefix negation after the first sum term as subtraction", () => {
    const expr = parseLatexToExpr("c + -a");
    const latex = exprToLatex(expr, false);
    expect(latex).toBe("c - a");
  });

  it("prints products with a negative leading factor as subtraction in sums", () => {
    const expr = parseLatexToExpr(String.raw`P \kappa + -T \beta`);
    const latex = exprToLatex(expr, false);

    expect(latex).toBe(String.raw`P \kappa - T \beta`);
  });

  it("prints products with a negative later factor as subtraction in sums", () => {
    const expr = {
      kind: "add",
      terms: [
        { kind: "symbol", name: "a" },
        {
          kind: "multiply",
          factors: [
            { kind: "symbol", name: "b" },
            { kind: "symbol", name: "c", sign: -1 },
          ],
        },
      ],
    } satisfies Expr;

    expect(exprToLatex(expr, false)).toBe("a - b c");
  });

  it("prints a leading negative product factor as the product sign", () => {
    const expr = parseLatexToExpr(
      String.raw`w = -\frac{\kappa v_0}{2} \left(P_f^{2} - P_i^{2}\right)`,
    );

    expect(exprToLatex(expr, false)).toBe(
      String.raw`w = -\frac{\kappa v_0}{2} \left(P_f^{2} - P_i^{2}\right)`,
    );
  });

  it("prints a later negative product factor as the product sign", () => {
    const expr = {
      kind: "multiply",
      factors: [
        {
          kind: "divide",
          numerator: { kind: "symbol", name: "R" },
          denominator: { kind: "symbol", name: "c_v" },
        },
        {
          kind: "call",
          sign: -1,
          callee: { kind: "symbol", name: "ln" },
          args: [{ kind: "symbol", name: "x" }],
          delimiter: "paren",
        },
      ],
    } satisfies Expr;

    expect(exprToLatex(expr, false)).toBe(String.raw`-\frac{R}{c_v} \ln\left(x\right)`);
  });

  it("prints signed fractions as subtraction in sums", () => {
    const expr = {
      kind: "add",
      terms: [
        { kind: "symbol", name: "a" },
        {
          kind: "divide",
          sign: -1,
          numerator: { kind: "symbol", name: "b" },
          denominator: { kind: "symbol", name: "c" },
        },
      ],
    } satisfies Expr;

    expect(exprToLatex(expr, false)).toBe(String.raw`a - \frac{b}{c}`);
  });

  it("flattens unsigned nested sums when rendering additive terms", () => {
    const expr = {
      kind: "add",
      terms: [
        { kind: "symbol", name: "a" },
        {
          kind: "add",
          terms: [
            {
              kind: "divide",
              sign: -1,
              numerator: { kind: "symbol", name: "b" },
              denominator: { kind: "symbol", name: "c" },
            },
            {
              kind: "divide",
              numerator: { kind: "symbol", name: "d" },
              denominator: { kind: "symbol", name: "e" },
            },
          ],
        },
      ],
    } satisfies Expr;

    expect(exprToLatex(expr, false)).toBe(String.raw`a - \frac{b}{c} + \frac{d}{e}`);
  });

  it("parses subtraction into signed terms", () => {
    const expr = parseLatexToExpr("a-b");

    expect(expr).toEqual({
      kind: "add",
      terms: [
        { kind: "symbol", name: "a" },
        { kind: "symbol", name: "b", sign: -1 },
      ],
      error: null,
    });
  });

  it("groups negative product factors when rendering products", () => {
    const expr = {
      kind: "multiply",
      factors: [
        { kind: "symbol", name: "P" },
        {
          kind: "multiply",
          sign: -1,
          factors: [{ kind: "symbol", name: "a" }, { kind: "symbol", name: "b" }],
        },
      ],
    } satisfies Expr;

    expect(exprToLatex(expr, false)).toBe(String.raw`P \left(-a b\right)`);
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

  it("renders display group power bases without stacking braces", () => {
    const expr = parseLatexToExpr(String.raw`\left(-\frac{1}{2} + 5\right)^2`);

    expect(exprToLatex(expr, false)).toBe(String.raw`\left(-\frac{1}{2} + 5\right)^{2}`);
  });

  it("wraps tagged display group power bases in explicit braces", () => {
    const expr = parseLatexToExpr(String.raw`\left(-\frac{1}{2} + 5\right)^2`);
    const latex = exprToLatex(expr, true);

    expect(latex).toContain(String.raw`\htmlData{node-id="n1"}{\left(`);
    expect(latex).not.toContain(String.raw`\htmlData{node-id="n2"}{\left(`);
    expect(latex).toContain(String.raw`\right)^{\htmlData{node-id="n8"}{2}}`);
  });

  it("wraps negate", () => {
    const expr = parseLatexToExpr("-a");
    const latex = exprToLatex(expr, true);
    expect(latex).toBe('\\htmlData{node-id="n1"}{-a}');
  });

  it("keeps signed primitive ids aligned with the compiled index", () => {
    const expr = parseLatexToExpr(String.raw`-11 = \sin \pi`);
    const latex = exprToLatex(expr, true);

    expect(latex).toContain('\\htmlData{node-id="n2"}{-11}');
    expect(latex).not.toContain('\\htmlData{node-id="n3"}{11}');
  });

  it("keeps signed integral ids aligned with the compiled index", () => {
    const expr = parseLatexToExpr(String.raw`w = -\int_{P_i}^{P_f} P v_0 \kappa \,\mathrm{d}{P}`);
    const document = compileMathDocumentFromExpr("", expr);
    const latex = exprToLatex(expr, true);
    const renderedIds = Array.from(latex.matchAll(/node-id="(n\d+)"/g), (match) => match[1]);

    expect(new Set(renderedIds)).toEqual(new Set(Object.keys(document.index.nodeById)));
  });

  it("keeps signed partial-at-constant ids aligned with the compiled index", () => {
    const expr = parseLatexToExpr(
      String.raw`H = F + T \left(-\left(\frac{\partial{F}}{\partial{T}}\right)_{V}\right) + P V`,
    );
    const document = compileMathDocumentFromExpr("", expr);
    const latex = exprToLatex(expr, true);
    const renderedIds = Array.from(latex.matchAll(/node-id="(n\d+)"/g), (match) => match[1]);

    expect(renderedIds).toEqual(Object.keys(document.index.nodeById));
    expect(latex).toContain(String.raw`\htmlData{node-id="n13"}{P} \htmlData{node-id="n14"}{V}`);
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

  it("wraps user functions in a MathLive class when tagged", () => {
    expect(exprToLatex(userFunction("f", sym("x")), true)).toBe(
      String.raw`\htmlData{node-id="n1"}{\class{pdp-user-function}{f\!\left(\htmlData{node-id="n2"}{x}\right)}}`,
    );
    expect(exprToLatex(userFunction("f", sym("x")), false)).toBe(String.raw`f\left(x\right)`);
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

  it("copies MathLive double-prime exponents as repeated prime marks", () => {
    const expr = parseLatexToExpr(String.raw`n^{\doubleprime}`);
    expect(exprToLatex(expr, false)).toBe("n''");
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

  it("renders thin spaces before differential factors in ordinary products", () => {
    const expr = parseLatexToExpr(String.raw`\mathrm{d}{v} = v_0 \beta \mathrm{d}{T} - v_0 \kappa \mathrm{d}{P}`);

    expect(exprToLatex(expr, false)).toBe(
      String.raw`\mathrm{d}{v} = v_0 \beta \,\mathrm{d}{T} - v_0 \kappa \,\mathrm{d}{P}`,
    );
  });

  it("keeps primes inside differential variables", () => {
    const expr = parseLatexToExpr(
      String.raw`v\left(T,P\right)=A\left(P\right)\exp\left(\int\beta\left(T^{\prime}\right)\mathrm{d}{T}^{\prime}\right)`,
    );

    expect(exprToLatex(expr, false)).toBe(
      String.raw`v \left(T , P\right) = A \left(P\right) \exp\left(\int \beta \left(T'\right) \,\mathrm{d}{T'}\right)`,
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
    const compactSecondOrderExpr = parseLatexToExpr(
      String.raw`\dfrac{\partial^2u}{\partial m\partial T}`,
    );
    const atConstExpr = parseLatexToExpr(
      String.raw`\left(\frac{\partial{s}}{\partial{T}}\right)_{P}`,
    );
    expect(exprToLatex(secondOrderExpr, false)).toBe(
      String.raw`\frac{\partial^{2}{s}}{\partial{P} \partial{T}}`,
    );
    expect(exprToLatex(compactSecondOrderExpr, false)).toBe(
      String.raw`\frac{\partial^{2}{u}}{\partial{m} \partial{T}}`,
    );
    expect(exprToLatex(atConstExpr, false)).toBe(
      String.raw`\left(\frac{\partial{s}}{\partial{T}}\right)_{P}`,
    );
  });

  it("round-trips second-order partials at constant quantity without swallowing partial macros", () => {
    const expr = parseLatexToExpr(
      String.raw`\left(\frac{\partial{^2g}}{\partial{T}^2}\right)_{P}=-\left(\frac{\partial{s}}{\partial{T}}\right)_{P}=-\frac{c_{P}}{T}`,
    );

    expect(exprToLatex(expr, false)).toBe(
      String.raw`\left(\frac{\partial^{2}{g}}{\partial{T}^{2}}\right)_{P} = -\left(\frac{\partial{s}}{\partial{T}}\right)_{P} = -\frac{c_P}{T}`,
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

  it("round-trips inexact differentials without tags", () => {
    const expr = parseLatexToExpr(String.raw`d^{\prime}W`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe(String.raw`\mathrm{d'}{W}`);
  });

  it("round-trips inexact differential equations with differential variable subscripts", () => {
    const expr = parseLatexToExpr(String.raw`\mathrm{d}^{\prime}{W}=Y\,\mathrm{d}{X}_1`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe(String.raw`\mathrm{d'}{W} = Y \,\mathrm{d}{X_1}`);
  });

  it("round-trips Greek symbol macros without tags", () => {
    const expr = parseLatexToExpr(String.raw`\rho`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe(String.raw`\rho`);
  });

  it("round-trips comma-separated symbol subscripts without tags", () => {
    const expr = parseLatexToExpr(String.raw`A_{T,P}`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe("A_{T,P}");
  });

  it("round-trips nested symbol subscripts with braces", () => {
    const expr = parseLatexToExpr(String.raw`C_{X_a}`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe("C_{X_a}");
  });

  it("renders multi-character numeric subscripts with braces", () => {
    const expr = parseLatexToExpr(String.raw`l_{23}`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe("l_{23}");
  });

  it("round-trips MathLive prime macros with multi-character subscripts", () => {
    const expr = parseLatexToExpr(String.raw`s^{\doubleprime\prime}-s^{\doubleprime}=\frac{l_{23}}{T}`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe(String.raw`s''' - s'' = \frac{l_{23}}{T}`);
  });

  it("round-trips limits without tags", () => {
    const expr = parseLatexToExpr(String.raw`\lim_{x \to 0} \frac{\sin x}{x}`);
    const latex = exprToLatex(expr, false);
    expect(latex).toBe(String.raw`\lim_{x \to 0} \frac{\sin x }{x}`);
  });
});
