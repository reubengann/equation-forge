import { expect, test } from "@playwright/test";
import {
  clickNodeByLatex,
  getRenderedLatex,
  setEquation,
  waitForMathRender,
} from "./helpers/dragMathlive";

function normalizeLatex(s: string): string {
  return s.replace(/\\,/g, " ").replace(/\s+/g, " ").trim();
}

test.describe("Evaluate selection", () => {
  test("evaluates a selected node (trig in degrees) via toolbar", async ({ page }) => {
    const equation = String.raw`\sin\left(30^{\circ}\right) = x`;
    await setEquation(page, equation);

    await clickNodeByLatex(page, equation, String.raw`\sin\left(30^{\circ}\right)`);
    const button = page.getByTestId("evaluate-button");
    await expect(button).toBeEnabled();
    await button.click();

    const latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toBe(normalizeLatex(String.raw`\frac{1}{2} = x`));
  });

  test("evaluates an additive span and supports undo/redo", async ({ page }) => {
    const equation = String.raw`a + 2 + 6 = 0`;
    await setEquation(page, equation);

    await clickNodeByLatex(page, equation, "2");
    await waitForMathRender(page);
    await page.keyboard.press("Shift+ArrowRight");

    const evalButton = page.getByTestId("evaluate-button");
    await expect(evalButton).toBeEnabled();
    await evalButton.click();

    let latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toBe("a + 8 = 0");

    const undo = page.getByTestId("undo-button");
    const redo = page.getByTestId("redo-button");

    await undo.click();
    latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toBe(normalizeLatex(equation));

    await redo.click();
    latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toBe("a + 8 = 0");
  });
});
