import { expect, test } from "@playwright/test";
import {
  getSelectedNodeIds,
  setEquation,
} from "./helpers/dragMathlive";

test.describe("Function name hit selection", () => {
  test("clicking near the exp token selects the exp expression", async ({ page }) => {
    const equation = String.raw`\exp\left(\ln\left(T\right)\right) = \exp\left(\int g \left(\theta\right) \,\mathrm{d}{\theta} + \ln\left(A'\right)\right)`;
    await setEquation(page, equation);
    const expNode = await page.evaluate(() => {
      const host = document.querySelector(
        '[data-testid="math-display"]'
      ) as HTMLElement | null;
      const sr = host?.shadowRoot ?? (host as any)?.shadowRoot;
      if (!sr) return null;
      const textNode = Array.from(
        sr.querySelectorAll<HTMLElement>("[data-node-id]")
      ).find((el) => (el.textContent ?? "").trim() === "exp");
      if (!textNode) return null;
      const rect = textNode.getBoundingClientRect();
      return {
        id: textNode.dataset.nodeId ?? "",
        point: {
          x: rect.left + 2,
          y: (rect.top + rect.bottom) / 2,
        },
      };
    });
    if (!expNode) throw new Error("Could not find rendered exp text");

    await page.mouse.click(expNode.point.x, expNode.point.y);

    await expect
      .poll(async () => await getSelectedNodeIds(page))
      .toContain(expNode.id);
  });
});
