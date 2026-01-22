import { expect, test } from "@playwright/test";
import { parse } from "../src/computeEngine";
import { clickNodeByLatex } from "./helpers/dragMathlive";

const EQUATION_DEF = String.raw`N = F_{g} \cos\left(\theta\right)`;
const EQUATION_USE = String.raw`-\mu_{s} N + F_{g} \sin\left(\theta\right) = m \ddot{x}`;

function buildPadData() {
  return [
    {
      id: "pad-1",
      snapshot: {
        latex: EQUATION_DEF,
        rootJson: parse(EQUATION_DEF)!,
      },
    },
    {
      id: "pad-2",
      snapshot: {
        latex: EQUATION_USE,
        rootJson: parse(EQUATION_USE)!,
      },
    },
  ];
}

test.describe("multi-pad substitution suggestions", () => {
  test("offers LHS-matching definition from another pad", async ({ page }) => {
    const pads = buildPadData();

    await page.goto("/");
    await page.evaluate((data) => {
      window.localStorage.setItem("derivation-pads", JSON.stringify(data));
    }, pads);
    await page.reload();
    await page.getByRole("button", { name: "Derivation (multi-pad)" }).click();

    await expect(page.getByTestId("math-display")).toHaveCount(2);

    await clickNodeByLatex(page, EQUATION_USE, "N", 1);
    await page.getByTestId("substitute-button").nth(1).click();

    const suggestion = page.getByTestId("substitute-suggestion-pad-1");
    await expect(suggestion).toBeVisible();
    await suggestion.click();

    await page.getByRole("button", { name: "OK" }).click();

    await expect
      .poll(async () => {
        const stored = await page.evaluate(() =>
          window.localStorage.getItem("derivation-pads")
        );
        if (!stored) return "";
        const parsed = JSON.parse(stored) as any[];
        const pad2 = parsed.find((p) => p.id === "pad-2");
        return (pad2?.snapshot?.latex as string) ?? "";
      })
      .toContain(String.raw`\cos\left(\theta\right)`);

    await expect
      .poll(async () => {
        const stored = await page.evaluate(() =>
          window.localStorage.getItem("derivation-pads")
        );
        if (!stored) return "";
        const parsed = JSON.parse(stored) as any[];
        const pad2 = parsed.find((p) => p.id === "pad-2");
        return (pad2?.snapshot?.latex as string) ?? "";
      })
      .not.toContain(" + N");
  });
});
