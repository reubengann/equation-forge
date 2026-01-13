import {
  ComputeEngine,
  type Expression,
  type LatexDictionaryEntry,
} from "@cortex-js/compute-engine";

const ce = new ComputeEngine();

function unwrapGroup(expr: Expression | null): Expression | null {
  if (Array.isArray(expr) && expr[0] === "Delimiter" && expr.length >= 2) {
    return expr[1] as Expression;
  }
  return expr;
}

function extractDerivativeOperand(expr: Expression | null): Expression | null {
  const inner = unwrapGroup(expr);

  if (Array.isArray(inner) && inner[0] === "Differential") {
    return (inner[1] as Expression) ?? null;
  }

  if (Array.isArray(inner) && inner[0] === "Power") {
    const base = inner[1];
    const exp = inner[2];
    if (Array.isArray(base) && base[0] === "Differential") {
      return ["Power", base[1] as Expression, exp] as Expression;
    }
    if (base === "DifferentialD") {
      return ["Power", "1", exp] as Expression;
    }
  }

  if (
    Array.isArray(inner) &&
    (inner[0] === "Multiply" || inner[0] === "InvisibleOperator")
  ) {
    const factors = inner.slice(1);
    const first = factors[0];

    const isDiffD = first === "DifferentialD";
    const isDiffNode = Array.isArray(first) && first[0] === "Differential";

    if ((isDiffD || isDiffNode) && factors.length >= 2) {
      const op = inner[0] as string;
      const base =
        isDiffNode && Array.isArray(first) && first[1]
          ? (first[1] as Expression)
          : (factors[1] as Expression);

      return [op, base, ...factors.slice(1)] as Expression;
    }
  }

  if (Array.isArray(inner) && inner[0] === "DifferentialD" && inner[1]) {
    return inner[1] as Expression;
  }

  return null;
}

const differentialEntry: LatexDictionaryEntry = {
  name: "Differential",
  kind: "expression",
  latexTrigger: "\\differentialD",
  parse: (parser) => {
    const arg = parser.parseGroup() ?? parser.parseToken();
    if (!arg) return "DifferentialD";
    return ["Differential", arg];
  },
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) return "\\mathrm{d}";
    const operand = expr[1] as Expression;
    const inner = serializer.wrap(operand, 0);
    return String.raw`\\mathrm{d}{${inner}}`;
  },
};

const fractionDerivativeEntry: LatexDictionaryEntry = {
  name: "FractionDerivative",
  kind: "expression",
  latexTrigger: "\\dfrac",
  parse: (parser) => {
    const numerator = parser.parseGroup() ?? parser.parseToken();
    const denominator = parser.parseGroup() ?? parser.parseToken();

    if (!numerator || !denominator) return null;

    const numOperand = extractDerivativeOperand(numerator);
    const denOperand = extractDerivativeOperand(denominator);

    if (numOperand && denOperand) {
      return [
        "FractionDerivative",
        ["Differential", numOperand],
        ["Differential", denOperand],
      ];
    }

    return ["Divide", numerator, denominator];
  },
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) return serializer.serialize(expr);

    const numerator = expr[1] as Expression;
    const denominator = expr[2] as Expression;

    const renderDifferential = (part: Expression): string => {
      if (Array.isArray(part) && part[0] === "Differential") {
        const inner = (part[1] ?? null) as Expression | null;
        const innerLatex = serializer.wrap(inner, 0);
        return String.raw`\\mathrm{d}{${innerLatex}}`;
      }
      // If it isn't wrapped, still render the operand and prepend d.
      const innerLatex = serializer.wrap(part, 0);
      return String.raw`\\mathrm{d}{${innerLatex}}`;
    };

    const numLatex = renderDifferential(numerator);
    const denLatex = renderDifferential(denominator);

    return String.raw`\\dfrac{${numLatex}}{${denLatex}}`;
  },
};

const baseDictionary = ComputeEngine.getLatexDictionary("all");

ce.latexDictionary = [
  differentialEntry,
  fractionDerivativeEntry,
  ...baseDictionary,
];

export { ce };
