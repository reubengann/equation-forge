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
