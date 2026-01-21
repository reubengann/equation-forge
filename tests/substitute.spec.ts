import { expect, test } from "@playwright/test";
import {
  clickNodeByLatex,
  getRenderedLatex,
  setEquation,
} from "./helpers/dragMathlive";
import { toMathLiveLatex } from "../src/infra/mathlive/differentialLatex";

test.setTimeout(20000);

function normalizeLatex(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

async function setSubstituteInput(page: any, latex: string) {
  const field = page.getByTestId("substitute-input");
  await field.waitFor();
  const mlLatex = toMathLiveLatex(latex);
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
    mlLatex
  );
}

test.describe("Substitute modal", () => {
  test("single occurrence substitution", async ({ page }) => {
    const equation = "a + a = b";
    await setEquation(page, equation);

    // Button disabled with no selection
    await expect(page.getByTestId("substitute-button")).toBeDisabled();

    // Act: select left 'a' and substitute with 'c'.
    await clickNodeByLatex(page, equation, "a");
    await page.getByTestId("substitute-button").click();

    await setSubstituteInput(page, "c");
    await page.getByRole("button", { name: "OK" }).click();

    // Assert: only one occurrence replaced.
    const latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toContain("c + a = b");
  });

  test("all occurrences substitution", async ({ page }) => {
    const equation = "a + a = b";
    await setEquation(page, equation);
    // Act: select 'a', substitute to 'c' with scope all.
    await clickNodeByLatex(page, equation, "a");
    await page.getByTestId("substitute-button").click();

    await setSubstituteInput(page, "c");
    await page.getByRole("radio", { name: /All matching/ }).check();
    await page.getByRole("button", { name: "OK" }).click();

    // Assert: both occurrences replaced.
    const latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toContain("c + c = b");
  });

  test("undo/redo around substitution", async ({ page }) => {
    const equation = "a + a = b";
    await setEquation(page, equation);
    // Act: substitute left 'a' with 'c'.
    await clickNodeByLatex(page, equation, "a");
    await page.getByTestId("substitute-button").click();

    await setSubstituteInput(page, "c");
    await page.getByRole("button", { name: "OK" }).click();

    // Assert undo/redo transitions.
    await expect(page.getByTestId("undo-button")).toBeEnabled();
    await page.getByTestId("undo-button").click();
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("a + a = b");
    await expect(page.getByTestId("undo-button")).toBeDisabled();
    await expect(page.getByTestId("redo-button")).toBeEnabled();

    await page.getByTestId("redo-button").click();
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("c + a = b");
    await expect(page.getByTestId("redo-button")).toBeDisabled();
  });

  test("differential macro stays upright in substitute input", async ({ page }) => {
    const equation = String.raw`2 \dot{x} \ddot{x} = 2 \dot{x} g \sin\left(\theta\right)`;
    await setEquation(page, equation);

    // Select the whole LHS.
    await clickNodeByLatex(page, equation, ["2 \\dot{x} \\ddot{x}", "2\\dot{x}\\ddot{x}"]);

    // Open substitute modal.
    await page.getByTestId("substitute-button").click();

    // Enter derivative operator using \differentialD.
    await setSubstituteInput(
      page,
      String.raw`\dfrac{\differentialD}{\differentialD t} (\dot{x})`
    );
    await page.getByRole("button", { name: "OK" }).click();

    const latex = normalizeLatex(await getRenderedLatex(page));

    // Should render upright d, not the symbol name.
    expect(latex).not.toContain("DifferentialD");
    expect(latex).toContain(String.raw`\mathrm{d}{t}`);
  });

  test("prefill round-trips for differentials (no d_upright/Nothing)", async ({
    page,
  }) => {
    const equation = String.raw`\dfrac{\mathrm{d}{f}}{\mathrm{d}{x}} = g`;
    await setEquation(page, equation);

    await clickNodeByLatex(page, equation, [
      String.raw`\frac{\mathrm{d}{f}}{\mathrm{d}{x}}`,
      String.raw`\dfrac{\mathrm{d}{f}}{\mathrm{d}{x}}`,
    ]);

    await page.getByTestId("substitute-button").click();

    // Accept without edits.
    await page.getByRole("button", { name: "OK" }).click();

    const latex = normalizeLatex(await getRenderedLatex(page));
    expect(latex).not.toContain("d_upright");
    expect(latex).not.toContain("Nothing");
    expect(latex).toContain(String.raw`\mathrm{d}{f}`);
    expect(latex).toContain(String.raw`\mathrm{d}{x}`);
    expect(latex).toContain("= g");
  });
});
