import { expect, test } from "@playwright/test";
import { waitForMathRender } from "./helpers/dragMathlive";

test.describe("Differentials end-to-end", () => {
  test("mathlive does not emit d_upright for d/dt integral", async ({ page }) => {
    const eq = String.raw`\int \frac{\mathrm{d}}{\mathrm{d}{t}} x \,\mathrm{d}{t}`;

    await page.goto("/");
    await page.locator('input[name="entry-mode"][value="mathlive"]').click({
      force: true,
    });

    const field = page.getByTestId("latex-input");
    await field.waitFor();
    await field.evaluate(
      async (el: any, value) => {
        if (typeof customElements !== "undefined" && customElements.whenDefined) {
          await customElements.whenDefined("math-field");
        }
        if (typeof el.setValue === "function") {
          el.setValue(value);
        } else {
          el.value = value;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
      },
      eq
    );

    await page.getByTestId("add-update").click();
    await waitForMathRender(page);

    // Read the MathJSON from the Debug page panel.
    const jsonText = await page.locator("#dp-expression-json").inputValue();
    const mj = JSON.parse(jsonText);

    expect(JSON.stringify(mj)).not.toContain("d_upright");
    expect(JSON.stringify(mj)).toContain("Differential");
  });
});
