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

  if (
    Array.isArray(inner) &&
    (inner[0] === "Multiply" || inner[0] === "InvisibleOperator")
  ) {
    const factors = inner.slice(1);
    if (factors[0] === "DifferentialD" && factors.length >= 2) {
      if (factors.length === 2) {
        return factors[1] as Expression;
      }
      return ["Multiply", ...factors.slice(1)] as Expression;
    }
  }

  if (Array.isArray(inner) && inner[0] === "DifferentialD" && inner[1]) {
    return inner[1] as Expression;
  }

  return null;
}

const differentialEntry: LatexDictionaryEntry = {
  name: "DifferentialD",
  kind: "symbol",
  latexTrigger: "\\differentialD",
  parse: "DifferentialD",
  serialize: "\\mathrm{d}",
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
      return ["FractionDerivative", numOperand, denOperand];
    }

    return ["Divide", numerator, denominator];
  },
  serialize: (serializer, expr) => {
    const numerator = Array.isArray(expr) ? (expr[1] as Expression) : null;
    const denominator = Array.isArray(expr) ? (expr[2] as Expression) : null;

    const numLatex = serializer.serialize(numerator);
    const denLatex = serializer.serialize(denominator);

    return String.raw`\\dfrac{\\mathrm{d}{${numLatex}}}{\\mathrm{d}{${denLatex}}}`;
  },
};

const baseDictionary = ComputeEngine.getLatexDictionary("all");

ce.latexDictionary = [
  differentialEntry,
  fractionDerivativeEntry,
  ...baseDictionary,
];

export { ce };
