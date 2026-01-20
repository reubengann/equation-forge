import { expect, test } from "@playwright/test";
import {
  dragByLatex,
  getRenderedLatex,
  setEquation,
  setMoveMode,
} from "./helpers/dragMathlive";

test.setTimeout(20000);

function normalizeLatex(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

test("multiplicative: drag scalar m to LHS of basis vector in dot product", async ({
  page,
}) => {
  const equation = String.raw`\vec{e}_{x} \cdot \vec{F}_{g} = \vec{e}_{x} \cdot m \ddot{\vec{r}}`;

  await setEquation(page, equation);
  await setMoveMode(page, "multiplicative");

  await dragByLatex(page, {
    equationLatex: equation,
    fromLatex: "m",
    toLatex: [
      String.raw`\vec{e}_{x} \cdot \vec{F}_{g}`,
      String.raw`\vec{e}_{x}\cdot\vec{F}_{g}`,
      String.raw`\vec{e}_x \cdot \vec{F}_g`,
    ],
    toBias: { dx: -40 }, // aim to the left of e_x to request "before"
  });

  const infoArgs = await page.getByTestId("info-args").inputValue();
  expect(infoArgs).toMatch(/"mode"\s*:\s*"multiplicative"/);

  const expectedForms = [
    String.raw`\frac{1}{m} \vec{e}_{x} \cdot \vec{F}_{g} = \vec{e}_{x} \cdot \ddot{\vec{r}}`,
    String.raw`\frac{\vec{e}_{x} \cdot \vec{F}_{g}}{m} = \vec{e}_{x} \cdot \ddot{\vec{r}}`,
  ].map(normalizeLatex);

  await page.waitForTimeout(400);
  const latex = await getRenderedLatex(page);
  const normalized = normalizeLatex(latex);
  const ok = expectedForms.some((f) => normalized.includes(f));
  if (!ok) {
    throw new Error(`Unexpected latex: ${normalized}`);
  }
});

test("multiplicative: drag scalar inside dot to the front", async ({ page }) => {
  const equation = String.raw`\vec{a} \cdot m \vec{b}`;

  await setEquation(page, equation);
  await setMoveMode(page, "multiplicative");

  await dragByLatex(page, {
    equationLatex: equation,
    fromLatex: "m",
    toLatex: String.raw`\vec{a} \cdot m \vec{b}`,
    toBias: { dx: -35 },
  });

  const infoArgs = await page.getByTestId("info-args").inputValue();
  expect(infoArgs).toMatch(/"mode"\s*:\s*"multiplicative"/);

  const latex = await getRenderedLatex(page);
  expect(normalizeLatex(latex)).toContain(
    normalizeLatex(String.raw`m \vec{a} \cdot \vec{b}`)
  );
});

test("multiplicative: drag denominator product across '=' to LHS", async ({
  page,
}) => {
  const equation = String.raw`x^2 + v_x = m a`;

  await setEquation(page, equation);
  await setMoveMode(page, "multiplicative");

  await dragByLatex(page, {
    equationLatex: equation,
    fromLatex: ["m a", "m\\,a", "m"],
    toLatex: ["x^{2} + v_{x}", "x^2 + v_x", "x^{2}+v_{x}", "x^2+v_x"],
  });

  const infoArgs = await page.getByTestId("info-args").inputValue();
  expect(infoArgs).toMatch(/"mode"\s*:\s*"multiplicative"/);

  const latex = await getRenderedLatex(page);
  expect(normalizeLatex(latex)).toContain(
    String.raw`\frac{x^{2} + v_{x}}{m a} = 1`
  );
});

test("multiplicative: drag denominator out of fraction to RHS", async ({
  page,
}) => {
  const equation = String.raw`\frac{x^{2} + v_{x}}{m a} = 1`;

  await setEquation(page, equation);
  await setMoveMode(page, "multiplicative");

  await dragByLatex(page, {
    equationLatex: equation,
    fromLatex: ["m a", "m\\,a", "m"],
    toLatex: "1",
  });

  const infoArgs = await page.getByTestId("info-args").inputValue();
  expect(infoArgs).toMatch(/"mode"\s*:\s*"multiplicative"/);

  const latex = await getRenderedLatex(page);
  expect(normalizeLatex(latex)).toContain(String.raw`x^{2} + v_{x} = m a`);
});
