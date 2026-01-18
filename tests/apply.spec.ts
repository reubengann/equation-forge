import { expect, test } from "@playwright/test";
import { getRenderedLatex, setEquation } from "./helpers/dragMathlive";

test.setTimeout(20000);

function normalizeLatex(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

async function setApplyInput(page: any, latex: string) {
  const field = page.getByTestId("apply-input");
  await field.waitFor();
  await field.evaluate((el: any, value) => {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, latex);
}

test.describe("Apply to both sides", () => {
  test("apply button disabled when not on an equation", async ({ page }) => {
    await setEquation(page, "a + b"); // not an equation
    await expect(page.getByTestId("apply-button")).toBeDisabled();
  });

  test("applies power to both sides", async ({ page }) => {
    const equation = "a + b = c";
    await setEquation(page, equation);

    await page.getByTestId("apply-button").click();
    await setApplyInput(page, "eqn^2");
    await page.getByRole("button", { name: "OK" }).click();

    const latex = await getRenderedLatex(page);
    const norm = normalizeLatex(latex);
    expect(norm).toContain("^");
    expect(norm).toContain("c^{2}");
  });

  test("undo/redo around apply", async ({ page }) => {
    const equation = "a + b = c";
    await setEquation(page, equation);

    await page.getByTestId("apply-button").click();
    await setApplyInput(page, "2 eqn");
    await page.getByRole("button", { name: "OK" }).click();

    await expect(page.getByTestId("undo-button")).toBeEnabled();
    await page.getByTestId("undo-button").click();
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("a + b = c");
    await expect(page.getByTestId("redo-button")).toBeEnabled();

    await page.getByTestId("redo-button").click();
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .not.toContain("a + b = c"); // should reflect applied operation
  });
});
