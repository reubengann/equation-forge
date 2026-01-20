import { expect, test } from "@playwright/test";
import { getRenderedLatex, setEquation } from "./helpers/dragMathlive";

function normalizeLatex(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

test.describe("Degrees literal rendering", () => {
  test("renders sin of 30 degrees", async ({ page }) => {
    const equation = String.raw`\sin\left(30^{\circ}\right)`;
    await setEquation(page, equation);

    const latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toBe(normalizeLatex(equation));
  });
});
