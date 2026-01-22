import { expect, test } from "@playwright/test";
import { fromMathLiveLatex } from "../src/infra/mathlive/differentialLatex";
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

  test("mathlive snippet button inserts derivative with placeholders and tab flow", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .locator('input[name="entry-mode"][value="mathlive"]')
      .click({ force: true });

    const field = page.getByTestId("latex-input");
    await field.waitFor();

    await page.getByTestId("snippet-derivative").click();
    await field.type("x");
    await field.press("Tab");
    await field.type("t");

    const latex = await field.evaluate((el: any) => {
      if (typeof el.getValue === "function") return el.getValue("latex");
      return el.value;
    });

    const normalized = fromMathLiveLatex(latex);

    expect(normalized).toContain(String.raw`\dfrac{\mathrm{d}{x}}{\mathrm{d}{t}}`);
  });

  test("plain text snippet button inserts d/dt at caret", async ({ page }) => {
    await page.goto("/");
    await page.locator('input[name="entry-mode"][value="text"]').click();

    const textarea = page.getByTestId("latex-input");
    await textarea.fill("");

    await page.getByTestId("snippet-derivative").click();
    await textarea.type("x");

    const latex = await textarea.inputValue();
    expect(latex).toBe(String.raw`\dfrac{\mathrm{d}{x}}{\mathrm{d}{}}`);
  });

  test("mathlive snippet button inserts definite integral template", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .locator('input[name="entry-mode"][value="mathlive"]')
      .click({ force: true });

    const field = page.getByTestId("latex-input");
    await field.waitFor();

    await page.getByTestId("snippet-integral").click();

    const latex = await field.evaluate((el: any) => {
      if (typeof el.getValue === "function") return el.getValue("latex");
      return el.value;
    });

    expect(latex).toContain(String.raw`\int_{a}^{b}\,\differentialD x`);
  });

  test("mathlive snippet button inserts indefinite integral template", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .locator('input[name="entry-mode"][value="mathlive"]')
      .click({ force: true });

    const field = page.getByTestId("latex-input");
    await field.waitFor();

    await page.getByTestId("snippet-indef-integral").click();

    const latex = await field.evaluate((el: any) => {
      if (typeof el.getValue === "function") return el.getValue("latex");
      return el.value;
    });

    expect(latex).toContain(String.raw`\int\,\differentialD x`);
  });

  test("mathlive snippet button inserts partial derivative template", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .locator('input[name="entry-mode"][value="mathlive"]')
      .click({ force: true });

    const field = page.getByTestId("latex-input");
    await field.waitFor();

    await page.getByTestId("snippet-partial-derivative").click();
    await field.type("f");
    await field.press("Tab");
    await field.type("x");

    const latex = await field.evaluate((el: any) => {
      if (typeof el.getValue === "function") return el.getValue("latex");
      return el.value;
    });

    expect(latex).toContain(String.raw`\dfrac{\partial f}{\partial x}`);
  });
});
