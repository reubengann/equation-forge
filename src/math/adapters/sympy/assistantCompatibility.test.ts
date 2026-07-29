import { describe, expect, it } from "vitest";
import { parseLatexToExpr } from "../latex";
import { tryExprToSympy } from "./exprToSympy";

type CompatibilityCase =
  | {
      name: string;
      latex: string;
      status: "supported";
      exprKind: string;
      codeIncludes: string[];
    }
  | {
      name: string;
      latex: string;
      status: "unsupported";
      exprKind: string;
      issueKinds: string[];
    };

/**
 * Representative inputs from jupyterlab-sympy-assistant's Python parser
 * tests. This is a migration inventory, not a claim that PDP should mimic
 * every legacy normalization. In particular, PDP preserves semantic nodes
 * such as differentials, text, and constrained partials instead of flattening
 * them into symbols or custom spp calls.
 */
const assistantCompatibilityCases: CompatibilityCase[] = [
  {
    name: "chained equality",
    latex: String.raw`\rho = \frac{m}{V} = \frac{1}{v}`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ["spp.And(", "spp.Eq(", 'spp.Symbol("\\\\rho")'],
  },
  {
    name: "subscripted symbols",
    latex: String.raw`\theta = \theta_3 \frac{X}{X_3}`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("\\\\theta_3")', 'spp.Symbol("X_3")'],
  },
  {
    name: "bounded integral",
    latex: String.raw`Q = n \int_{T_1}^{T_2} c \, dT`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ["spp.Integral(", 'spp.Symbol("T_1")', 'spp.Symbol("T_2")'],
  },
  {
    name: "square root",
    latex: String.raw`c = \sqrt{\frac{\gamma}{\rho \kappa}}`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ["spp.Pow(", 'spp.Symbol("\\\\gamma")', 'spp.Symbol("\\\\kappa")'],
  },
  {
    name: "ordinary differential symbols",
    latex: String.raw`dU = dQ - dW`,
    status: "unsupported",
    exprKind: "equation",
    issueKinds: ["differential"],
  },
  {
    name: "standalone text atom",
    latex: String.raw`\left(P + \frac{a}{v^{2}}\right) \left(v - b\right)^{\frac{R}{c_{v}} + 1} = \text{const}`,
    status: "unsupported",
    exprKind: "equation",
    issueKinds: ["text"],
  },
  {
    name: "constrained partial derivative",
    latex: String.raw`c_P = c_v + \left[\left(\dfrac{\partial u}{\partial v}\right)_T + P\right] \left(\dfrac{\partial v}{\partial T}\right)_P`,
    status: "unsupported",
    exprKind: "equation",
    issueKinds: ["partial_at_const_quantity"],
  },
  {
    name: "delta quantity",
    latex: String.raw`\Delta Q = n c_v \Delta T + \frac{n c_v T_0}{2}`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("\\\\Delta Q")', 'spp.Symbol("\\\\Delta T")'],
  },
];

describe("jupyterlab-sympy-assistant compatibility", () => {
  it.each(assistantCompatibilityCases)("$name is explicitly $status", (testCase) => {
    const expr = parseLatexToExpr(testCase.latex);
    const result = tryExprToSympy(expr, { namespace: "spp" });

    expect(expr.kind).toBe(testCase.exprKind);

    if (testCase.status === "supported") {
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      testCase.codeIncludes.forEach((fragment) => expect(result.code).toContain(fragment));
      return;
    }

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect([...new Set(result.issues.map((issue) => issue.exprKind))]).toEqual(testCase.issueKinds);
  });
});
