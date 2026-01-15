import { expect, test } from "@playwright/test";
import {
  dragByLatex,
  getRenderedLatex,
  setEquation,
  setMoveMode,
} from "./helpers/dragMathlive";

function normalizeLatex(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

test.describe("Undo/redo for moves", () => {
  test("additive move across '=' supports undo/redo", async ({ page }) => {
    const equation = "a + b = c";
    await setEquation(page, equation);
    await setMoveMode(page, "additive");

    // Act: drag b across '=' to RHS.
    await dragByLatex(page, {
      equationLatex: equation,
      fromLatex: "b",
      toLatex: "c",
    });

    // Assert: move applied.
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("a = c - b");

    // Act: undo.
    await page.getByTestId("undo-button").click();
    // Assert: back to original equation.
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("a + b = c");

    // Act: redo.
    await page.getByTestId("redo-button").click();
    // Assert: move re-applied.
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("a = c - b");
  });

  test("multiplicative move across '=' supports undo/redo", async ({ page }) => {
    const equation = String.raw`x^2 + v_x = m a`;
    await setEquation(page, equation);
    await setMoveMode(page, "multiplicative");

    // Act: move m a across '='.
    await dragByLatex(page, {
      equationLatex: equation,
      fromLatex: ["m a", "m\\,a", "m"],
      toLatex: ["x^{2} + v_{x}", "x^2 + v_x", "x^{2}+v_{x}", "x^2+v_x"],
    });

    // Assert: move applied.
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain(String.raw`\frac{x^{2} + v_{x}}{m a} = 1`);

    // Act: undo.
    await page.getByTestId("undo-button").click();
    // Assert: back to original equation.
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain(String.raw`x^{2} + v_{x} = m a`);

    // Act: redo.
    await page.getByTestId("redo-button").click();
    // Assert: move re-applied.
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain(String.raw`\frac{x^{2} + v_{x}}{m a} = 1`);
  });
});
