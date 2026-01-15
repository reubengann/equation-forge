import { expect, test } from "@playwright/test";
import {
  dragByLatex,
  getRenderedLatex,
  setEquation,
  setMoveMode,
} from "./helpers/dragMathlive";

type MoveCase = {
  title: string;
  mode: "additive" | "multiplicative";
  equation: string;
  fromLatex: string | string[];
  toLatex: string | string[];
  expectedLatex: string;
  toBias?: { dx?: number; dy?: number };
  preClick?: boolean;
};

function normalizeLatex(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const cases: MoveCase[] = [
  {
    title: "additive reorder within a sum",
    mode: "additive",
    equation: String.raw`a + b + c = d`,
    fromLatex: "b",
    toLatex: "c",
    expectedLatex: String.raw`a + c + b = d`,
    toBias: { dx: 6 },
  },
  {
    title: "additive cross '=' wraps into other side with sign flip",
    mode: "additive",
    equation: String.raw`a + b = c`,
    fromLatex: "b",
    toLatex: "c",
    expectedLatex: String.raw`a = c - b`,
  },
  {
    title: "additive cross '=' flips negated term",
    mode: "additive",
    equation: String.raw`a - b = c`,
    fromLatex: "b",
    toLatex: "c",
    expectedLatex: String.raw`a = c + b`,
  },
  {
    title: "multiplicative cross '=' moves factor to denominator",
    mode: "multiplicative",
    equation: String.raw`a = b c`,
    fromLatex: "b",
    toLatex: "a",
    expectedLatex: String.raw`\frac{a}{b c} = 1`,
  },
  {
    title: "multiplicative cross '=' moves denominator to lhs",
    mode: "multiplicative",
    equation: String.raw`a = \frac{c}{b}`,
    fromLatex: "b",
    toLatex: "a",
    expectedLatex: String.raw`a b = c`,
  },
  {
    title: "multiplicative reorder within a product container",
    mode: "multiplicative",
    equation: String.raw`1 = a b c`,
    fromLatex: "b",
    toLatex: "a",
    expectedLatex: String.raw`1 = b a c`,
    toBias: { dx: -10 },
    preClick: false,
  },
];

for (const c of cases) {
  test(`moves: ${c.title}`, async ({ page }) => {
    await setEquation(page, c.equation);
    await setMoveMode(page, c.mode);

    const drag = await dragByLatex(page, {
      equationLatex: c.equation,
      fromLatex: c.fromLatex,
      toLatex: c.toLatex,
      toBias: c.toBias,
      preClick: c.preClick,
    });

    const latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toContain(normalizeLatex(c.expectedLatex));
    const infoArgs = await page.getByTestId("info-args").inputValue();
    expect(infoArgs).toMatch(new RegExp(`"mode"\\s*:\\s*"${c.mode}"`));
  });
}
