import {
  ComputeEngine,
  type Expression,
  type LatexDictionaryEntry,
} from "@cortex-js/compute-engine";
import type { MJ } from "./ExpressionTree";

const ce = new ComputeEngine();

export function parse(latex: string): MJ | null {
  const mj = (ce.parse(latex, { canonical: false })?.json as MJ) ?? null;
  const normalized = normalizeDotProducts(
    rewriteNegateToFrontOfProduct(normalizeProducts(normalizeVectors(mj)))
  );
  return normalized;
}

function rewriteNegateToFrontOfProduct(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;

  const op = mj[0];

  if (op === "Multiply" || op === "InvisibleOperator") {
    let negateCount = 0;
    const factors: MJ[] = [];

    for (let i = 1; i < mj.length; i += 1) {
      const rewritten = rewriteNegateToFrontOfProduct(mj[i] as MJ);
      let current = rewritten as MJ | null;
      while (Array.isArray(current) && current[0] === "Negate") {
        negateCount += 1;
        current = (current.length > 1 ? (current[1] as MJ) : null) ?? null;
      }
      factors.push(current as MJ);
    }

    const product = [op, ...factors] as MJ;
    return negateCount % 2 === 1 ? (["Negate", product] as MJ) : product;
  }

  const rewrittenKids = mj
    .slice(1)
    .map((child) => rewriteNegateToFrontOfProduct(child as MJ));
  return [op, ...rewrittenKids] as MJ;
}

function normalizeVectors(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj.slice(1).map((child) => normalizeVectors(child as MJ));
  const newOp = op === "OverVector" ? ("Vector" as const) : op;
  return [newOp, ...kids] as MJ;
}

function normalizeProducts(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;
  const op = mj[0];
  const kids = mj.slice(1).map((child) => normalizeProducts(child as MJ));
  if (op === "Multiply") {
    return ["InvisibleOperator", ...kids] as MJ;
  }
  return [op, ...kids] as MJ;
}

function containsVector(expr: MJ | null): boolean {
  if (expr === null || expr === undefined) return false;
  if (!Array.isArray(expr)) return false;
  if (expr[0] === "Vector" || expr[0] === "OverVector") return true;
  return expr.slice(1).some((c) => containsVector(c as MJ));
}

function splitProductFactors(expr: MJ): { scalars: MJ[]; others: MJ[] } {
  if (Array.isArray(expr) && expr[0] === "InvisibleOperator") {
    const scalars: MJ[] = [];
    const others: MJ[] = [];
    for (let i = 1; i < expr.length; i += 1) {
      const part = expr[i] as MJ;
      if (containsVector(part)) {
        others.push(part);
      } else {
        scalars.push(part);
      }
    }
    return { scalars, others };
  }
  return containsVector(expr) ? { scalars: [], others: [expr] } : { scalars: [expr], others: [] };
}

function buildProduct(factors: MJ[]): MJ | null {
  if (factors.length === 0) return null;
  if (factors.length === 1) return factors[0];
  return ["InvisibleOperator", ...factors] as MJ;
}

function normalizeDotProducts(mj: MJ | null): MJ | null {
  if (mj === null || mj === undefined) return mj;
  if (!Array.isArray(mj)) return mj;

  const op = mj[0];
  const kids = mj.slice(1).map((child) => normalizeDotProducts(child as MJ));

  if (op === "InvisibleOperator") {
    const factors = kids as MJ[];
    const vectorFactors = factors.filter((f) => containsVector(f));
    if (vectorFactors.length === 2) {
      const scalarFactors = factors.filter((f) => !containsVector(f));
      const leftSplit = splitProductFactors(vectorFactors[0] as MJ);
      const rightSplit = splitProductFactors(vectorFactors[1] as MJ);
      const leftInner =
        buildProduct([...leftSplit.scalars, ...leftSplit.others]) ??
        vectorFactors[0];
      const rightInner =
        buildProduct([...rightSplit.scalars, ...rightSplit.others]) ??
        vectorFactors[1];
      const dot: MJ = ["DotProduct", leftInner, rightInner];
      return scalarFactors.length > 0
        ? (["InvisibleOperator", ...scalarFactors, dot] as MJ)
        : dot;
    }
    return [op, ...kids] as MJ;
  }

  if (op !== "DotProduct") {
    return [op, ...kids] as MJ;
  }

  const left = kids[0] as MJ | undefined;
  const right = kids[1] as MJ | undefined;
  if (!left || !right) return [op, ...kids] as MJ;

  const leftSplit = splitProductFactors(left);
  const rightSplit = splitProductFactors(right);

  const outerScalars = [...leftSplit.scalars, ...rightSplit.scalars];
  const leftInner = buildProduct(leftSplit.others) ?? left;
  const rightInner = buildProduct(rightSplit.others) ?? right;

  const core: MJ = ["DotProduct", leftInner, rightInner];
  return outerScalars.length > 0
    ? (["InvisibleOperator", ...outerScalars, core] as MJ)
    : core;
}

export function box(mj: MJ) {
  return ce.box(mj);
}

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

    if ((isDiffD || isDiffNode || isPartial) && factors.length >= 2) {
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

    if (
      numOperand &&
      denOperand &&
      numOperand.kind === "d" &&
      denOperand.kind === "d"
    ) {
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

const dotEntry: LatexDictionaryEntry = {
  name: "DotProduct",
  kind: "infix",
  latexTrigger: "\\cdot",
  precedence: 390,
  associativity: "left",
  parse: (parser, lhs) => {
    if (!lhs) return null;
    const rhs = parser.parseExpression({ minPrec: 390 });
    if (!rhs) return null;
    return ["DotProduct", lhs as Expression, rhs];
  },
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) return serializer.serialize(expr);
    const lhs = serializer.wrap(expr[1] as Expression, 390);
    const rhs = serializer.wrap(expr[2] as Expression, 390);
    return `${lhs} \\\\cdot ${rhs}`;
  },
};

const overDotEntry: LatexDictionaryEntry = {
  name: "OverDot",
  kind: "expression",
  latexTrigger: "\\dot",
  parse: (parser) => {
    const arg = parser.parseGroup() ?? parser.parseToken();
    if (!arg) return null;
    return ["OverDot", arg, 1];
  },
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) {
      const inner = serializer.wrap(expr, 0);
      return String.raw`\\dot{${inner}}`;
    }
    const inner = serializer.wrap(expr[1] as Expression, 0);
    const count = typeof expr[2] === "number" ? Number(expr[2]) : 1;
    return count >= 2
      ? String.raw`\\ddot{${inner}}`
      : String.raw`\\dot{${inner}}`;
  },
};

const vectorEntry: LatexDictionaryEntry = {
  name: "Vector",
  kind: "expression",
  latexTrigger: "\\vec",
  parse: (parser) => {
    const arg = parser.parseGroup() ?? parser.parseToken();
    if (!arg) return null;
    return ["Vector", arg];
  },
  serialize: (serializer, expr) => {
    const inner = Array.isArray(expr)
      ? serializer.wrap(expr[1] as Expression, 0)
      : serializer.wrap(expr, 0);
    return String.raw`\\vec{${inner}}`;
  },
};

const ddotEntry: LatexDictionaryEntry = {
  name: "DoubleOverDot",
  kind: "expression",
  latexTrigger: "\\ddot",
  parse: (parser) => {
    const arg = parser.parseGroup() ?? parser.parseToken();
    if (!arg) return null;
    return ["OverDot", arg, 2];
  },
  serialize: (serializer, expr) => {
    if (!Array.isArray(expr)) {
      const inner = serializer.wrap(expr, 0);
      return String.raw`\\ddot{${inner}}`;
    }
    const inner = serializer.wrap(expr[1] as Expression, 0);
    return String.raw`\\ddot{${inner}}`;
  },
};

// Remove any built-in Vector entry so we can supply our own shape.
const baseDictionary = ComputeEngine.getLatexDictionary("all").filter(
  (entry) =>
    entry.name !== "Vector" &&
    // Remove the built-in centered dot-as-multiply entry so we can override it.
    (entry as any).latexTrigger !== "\\cdot"
);

ce.latexDictionary = [
  vectorEntry,
  partialEntry,
  differentialEntry,
  fractionPartialDerivativeEntry,
  fractionDerivativeEntry,
  overDotEntry,
  dotEntry,
  ddotEntry,
  ...baseDictionary,
];
