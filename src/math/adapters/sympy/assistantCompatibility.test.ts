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
 * every legacy normalization. PDP preserves semantic nodes in its AST while
 * the SymPy adapter supplies the assistant's required output policy.
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
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("dU")', 'spp.Symbol("dQ")', 'spp.Symbol("dW")'],
  },
  {
    name: "standalone text atom",
    latex: String.raw`\left(P + \frac{a}{v^{2}}\right) \left(v - b\right)^{\frac{R}{c_{v}} + 1} = \text{const}`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("const")'],
  },
  {
    name: "constrained partial derivative",
    latex: String.raw`c_P = c_v + \left[\left(\dfrac{\partial u}{\partial v}\right)_T + P\right] \left(\dfrac{\partial v}{\partial T}\right)_P`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ["spp.partial(", "hold="],
  },
  {
    name: "delta quantity",
    latex: String.raw`\Delta Q = n c_v \Delta T + \frac{n c_v T_0}{2}`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("\\\\Delta Q")', 'spp.Symbol("\\\\Delta T")'],
  },
  {
    name: "script symbols and implicit products",
    latex: String.raw`L = L_0 \left[1 + \frac{\mathscr{F}}{Y A} + \alpha (T - T_0)\right]`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("\\\\mathscr{F}")'],
  },
  {
    name: "implicit symbol calls",
    latex: String.raw`L = f (a - b)`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("f")'],
  },
  {
    name: "powered implicit products",
    latex: String.raw`c_v = A \left(\frac{T}{\theta}\right)^3`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ["spp.Pow("],
  },
  {
    name: "apostrophe differentials",
    latex: String.raw`dU = d'Q - d'W`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("dQ")', 'spp.Symbol("dW")'],
  },
  {
    name: "text subscripts and script symbols",
    latex: String.raw`m c_P (T_\text{boil} - T_\text{melt}) = \mathscr{P} (t_4 - t_3)`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("\\\\mathscr{P}")'],
  },
  {
    name: "script symbols before differentials",
    latex: String.raw`\mathrm{d}{U} = T \,\mathrm{d}{S} - P \,\mathrm{d}{V} + \mathscr{H} \,\mathrm{d}{M}`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("dU")', 'spp.Symbol("\\\\mathscr{H}")'],
  },
  {
    name: "plain letter subscripts",
    latex: String.raw`q_{acb} - w_{acb} = q_{ab} - w_{ab}`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("q_acb")', 'spp.Symbol("w_ab")'],
  },
  {
    name: "script text subscripts in integrals",
    latex: String.raw`W = \int_{x_0}^{0.9 x_0} \left[\frac{n R T}{x} + \mathscr{F}_\text{fric.}\right] \, dx`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ["spp.Integral(", 'spp.Symbol("\\\\mathscr{F_fric}")'],
  },
  {
    name: "script numeric subscripts",
    latex: String.raw`\Delta h = - w_\text{sh} - \frac12 (\mathscr{V}_2^2 - \mathscr{V}_1^2)`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("\\\\mathscr{V_1}")', 'spp.Symbol("\\\\mathscr{V_2}")'],
  },
  {
    name: "braced constrained partial",
    latex: String.raw`c_{P} = \left(\frac{\partial{h}}{\partial{T}}\right)_{P}`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ["spp.partial(", "hold="],
  },
  {
    name: "roman differentials in integrals",
    latex: String.raw`-\int_{T_{1}}^{T_{2}} \,\mathrm{d}{T} = \int_{V}^{2 V} \frac{a}{c_{v} v^{2}} \,\mathrm{d}{v}`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ["spp.Integral("],
  },
  {
    name: "lowercase delta quantity",
    latex: String.raw`\Delta s = c_{P} \ln\left(\frac{T}{T_{0}}\right) - \beta v_{0} \left(P - P_{0}\right)`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("\\\\Delta s")', "spp.log("],
  },
  {
    name: "apostrophe and nested differentials",
    latex: String.raw`d'q = dh - v \, dP`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("dq")', 'spp.Symbol("dP")'],
  },
  {
    name: "braced subscript differentials",
    latex: String.raw`\mathrm{d}{T_{s}} = \frac{\beta v T}{c_{P}} \mathrm{d}{P_{s}}`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("dT_s")', 'spp.Symbol("dP_s")'],
  },
  {
    name: "indicating superscript differentials",
    latex: String.raw`\mathrm{d}{n_1}^{\left(1\right)} = \mathrm{d}{n_1^{\left(2\right)}}`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: [
      'spp.Symbol("dn_1^{\\\\left(1\\\\right)}")',
      'spp.Symbol("dn_1^{\\\\left(2\\\\right)}")',
    ],
  },
  {
    name: "subscripts in constrained partials",
    latex: String.raw`\left(\frac{\partial{c_{v}}}{\partial{v}}\right)_{T} = \left(\frac{\partial{c_{v}}}{\partial{\rho_{r}}}\right)_{T} \left(\frac{\partial{\rho_{r}}}{\partial{v}}\right)_{T}`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("\\\\rho_r")', "spp.partial("],
  },
  {
    name: "roman prime differential",
    latex: String.raw`\mathrm{d}'{q_r} = T \left(\frac{\partial{P}}{\partial{T}}\right)_{v} \mathrm{d}{v}`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("dq_r")', "spp.partial("],
  },
  {
    name: "ordinary differential fraction",
    latex: String.raw`$$\frac{\mathrm{d}{P}}{\mathrm{d}{T}} = \frac{l_{12}}{T \left(v'' - v'\right)}$$`,
    status: "supported",
    exprKind: "equation",
    codeIncludes: ['spp.Symbol("dP")', 'spp.Symbol("dT")'],
  },
];

describe("jupyterlab-sympy-assistant compatibility", () => {
  it.each(assistantCompatibilityCases)("$name is explicitly $status", (testCase) => {
    const expr = parseLatexToExpr(testCase.latex);
    const result = tryExprToSympy(expr, {
      namespace: "spp",
      constrainedPartialFunction: "partial",
    });

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
