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

function extractDerivativeOperand(
  expr: Expression | null
): { kind: "d" | "partial"; operand: Expression } | null {
  const inner = unwrapGroup(expr);

  if (Array.isArray(inner) && inner[0] === "Differential") {
    return { kind: "d", operand: (inner[1] as Expression) ?? inner[1] };
  }

  if (Array.isArray(inner) && inner[0] === "Partial") {
    return { kind: "partial", operand: (inner[1] as Expression) ?? inner[1] };
  }

  if (
    Array.isArray(inner) &&
    inner[0] === "InvisibleOperator" &&
    Array.isArray(inner[1]) &&
    inner[1][0] === "PartialDerivative" &&
    inner.length >= 3
  ) {
    // CE base dictionary emits this shape for \partial f
    return { kind: "partial", operand: inner[2] as Expression };
  }

  if (Array.isArray(inner) && inner[0] === "Power") {
    const base = inner[1];
    const exp = inner[2];
    if (Array.isArray(base) && base[0] === "Differential") {
      return {
        kind: "d",
        operand: ["Power", base[1] as Expression, exp] as Expression,
      };
    }
    if (Array.isArray(base) && base[0] === "Partial") {
      return {
        kind: "partial",
        operand: ["Power", base[1] as Expression, exp] as Expression,
      };
    }
    if (base === "DifferentialD") {
      return { kind: "d", operand: ["Power", "1", exp] as Expression };
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
    const isPartial = Array.isArray(first) && first[0] === "Partial";

    if (
      (isDiffD || isDiffNode || isPartial) &&
      factors.length >= 2
    ) {
      const op = inner[0] as string;
      const base =
        isDiffNode && Array.isArray(first) && first[1]
          ? (first[1] as Expression)
          : isPartial && Array.isArray(first) && first[1]
          ? (first[1] as Expression)
          : (factors[1] as Expression);

      const kind = isPartial ? "partial" : "d";
      return { kind, operand: [op, base, ...factors.slice(1)] as Expression };
    }
  }

  if (Array.isArray(inner) && inner[0] === "DifferentialD" && inner[1]) {
    return { kind: "d", operand: inner[1] as Expression };
  }

  if (inner === "PartialD") {
    return { kind: "partial", operand: "1" as Expression };
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

const partialEntry: LatexDictionaryEntry = {
  name: "Partial",
  kind: "expression",
  latexTrigger: "\\partial",
  parse: (parser) => {
    const arg = parser.parseGroup() ?? parser.parseToken();
    if (!arg) return "PartialD";
    return ["Partial", arg];
  },
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) return "\\partial";
    const operand = expr[1] as Expression;
    const inner = serializer.wrap(operand, 0);
    return String.raw`\\partial{${inner}}`;
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

    if (numOperand && denOperand && numOperand.kind === "d" && denOperand.kind === "d") {
      return [
        "FractionDerivative",
        ["Differential", numOperand.operand],
        ["Differential", denOperand.operand],
      ];
    }

    if (
      numOperand &&
      denOperand &&
      numOperand.kind === "partial" &&
      denOperand.kind === "partial"
    ) {
      return [
        "FractionPartialDerivative",
        ["Partial", numOperand.operand],
        ["Partial", denOperand.operand],
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

    const renderPartial = (part: Expression): string => {
      if (Array.isArray(part) && part[0] === "Partial") {
        const inner = (part[1] ?? null) as Expression | null;
        const innerLatex = serializer.wrap(inner, 0);
        return String.raw`\\partial{${innerLatex}}`;
      }
      const innerLatex = serializer.wrap(part, 0);
      return String.raw`\\partial{${innerLatex}}`;
    };

    const isPartial =
      Array.isArray(expr) && expr[0] === "FractionPartialDerivative";

    const render = isPartial ? renderPartial : renderDifferential;

    const numLatex = render(numerator);
    const denLatex = render(denominator);

    return String.raw`\\dfrac{${numLatex}}{${denLatex}}`;
  },
};

const fractionPartialDerivativeEntry: LatexDictionaryEntry = {
  name: "FractionPartialDerivative",
  kind: "expression",
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) return serializer.serialize(expr);
    const numerator = expr[1] as Expression;
    const denominator = expr[2] as Expression;

    const renderPartial = (part: Expression): string => {
      if (Array.isArray(part) && part[0] === "Partial") {
        const inner = (part[1] ?? null) as Expression | null;
        const innerLatex = serializer.wrap(inner, 0);
        return String.raw`\\partial{${innerLatex}}`;
      }
      const innerLatex = serializer.wrap(part, 0);
      return String.raw`\\partial{${innerLatex}}`;
    };

    const numLatex = renderPartial(numerator);
    const denLatex = renderPartial(denominator);

    return String.raw`\\dfrac{${numLatex}}{${denLatex}}`;
  },
};

const baseDictionary = ComputeEngine.getLatexDictionary("all");

ce.latexDictionary = [
  partialEntry,
  differentialEntry,
  fractionPartialDerivativeEntry,
  fractionDerivativeEntry,
  ...baseDictionary,
];

export { ce };
