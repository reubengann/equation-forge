import { expect, test } from "@playwright/test";
import { waitForMathRender } from "./helpers/dragMathlive";

test.describe("MathLive macros", () => {
  test("vec macro renders as bold and logs no JSON warning", async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on("console", (msg) => consoleMessages.push(msg.text()));

    await page.goto("/");

    await page
      .locator('input[name="entry-mode"][value="mathlive"]')
      .click({ force: true });

    const field = page.getByTestId("latex-input");
    await field.waitFor();
    await field.evaluate((el: any, value) => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, "a = \\vec{v}");

    await page.getByTestId("add-update").click();
    await waitForMathRender(page);

    const renderInfo = await page.$eval(
      '[data-testid="math-display"]',
      (el: any) => {
        const latexExpanded = el.getValue?.("latex-expanded");
        const shadowHtml = el.shadowRoot?.innerHTML ?? "";
        const hasBold =
          shadowHtml.includes("ML__bf") ||
          shadowHtml.includes("ML__bold") ||
          shadowHtml.includes("mathbf") ||
          shadowHtml.includes("font-weight");
        return {
          latexExpanded,
          hasBold,
          value: el.value,
          macros: el.macros,
        };
      }
    );

    expect(
      renderInfo.latexExpanded?.includes("\\mathbf{v}") ||
        renderInfo.value?.includes("\\mathbf{v}") ||
        renderInfo.hasBold
    ).toBeTruthy();

    const warning = consoleMessages.find((m) =>
      m.includes("Invalid macros JSON")
    );
    expect(warning).toBeUndefined();
  });
});
