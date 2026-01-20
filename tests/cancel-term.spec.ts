import { expect, test } from "@playwright/test";
import {
  setEquation,
  getRenderedLatex,
  clickNodeByLatex,
  waitForMathRender,
} from "./helpers/dragMathlive";

function normalizeLatex(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

test.describe("Term cancellation", () => {
  test("Delete key removes a zero-equivalent term from a sum", async ({ page }) => {
    const equation = String.raw`a + \left(b - b\right) = c`;
    await setEquation(page, equation);

    await clickNodeByLatex(page, equation, String.raw`\left(b - b\right)`);
    await page.keyboard.press("Delete");

    const latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toBe("a = c");
  });

  test("toolbar button cancels the selected term", async ({ page }) => {
    const equation = String.raw`a + \left(b - b\right) = c`;
    await setEquation(page, equation);

    await clickNodeByLatex(page, equation, String.raw`\left(b - b\right)`);
    await waitForMathRender(page);
    const button = page.getByTestId("cancel-term-button");
    await expect(button).toBeEnabled();
    await button.click();

    const latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toBe("a = c");
  });
});
