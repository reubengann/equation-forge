import { expect, test } from "@playwright/test";
import { getRenderedLatex, setEquation } from "./helpers/dragMathlive";

test.setTimeout(20000);

function normalizeLatex(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

test.describe("Flip equation toolbar", () => {
  test("flips equation and supports undo/redo", async ({ page }) => {
    const equation = "a + b = c";
    await setEquation(page, equation);

    await expect(page.getByTestId("flip-button")).toBeEnabled();
    await page.getByTestId("flip-button").click();

    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("c = a + b");

    await page.getByTestId("undo-button").click();
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("a + b = c");

    await page.getByTestId("redo-button").click();
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("c = a + b");
  });

  test("disables flip when not an equation", async ({ page }) => {
    await setEquation(page, "a + b");
    await expect(page.getByTestId("flip-button")).toBeDisabled();
  });
});
