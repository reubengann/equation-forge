import { expect, test } from "@playwright/test";
import {
  dragByLatex,
  getRenderedLatex,
  setEquation,
  setMoveMode,
} from "./helpers/dragMathlive";

test.setTimeout(20000);

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
    .toContain(String.raw`\frac{x^{2} + v_{x}}{m} = a`);

    // Act: undo.
    await page.getByTestId("undo-button").click();
    // Assert: back to original equation.
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toMatch(
        /x(\^2|\^\{2\}) \+ v(_x|_\{x\}) = m a/,
      );

    // Act: redo.
    await page.getByTestId("redo-button").click();
    // Assert: move re-applied.
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain(String.raw`\frac{x^{2} + v_{x}}{m} = a`);
  });

  test("editing from older step asks before invalidating future history", async ({
    page,
  }) => {
    const equation = "a + b = c";
    await setEquation(page, equation);
    await setMoveMode(page, "additive");

    await dragByLatex(page, {
      equationLatex: equation,
      fromLatex: "b",
      toLatex: "c",
    });

    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("a = c - b");

    await page.getByTestId("undo-button").click();
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("a + b = c");

    await page.getByTestId("flip-button").click();
    await expect(page.getByText("Discard later history?")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Discard later history?")).toBeHidden();

    await page.getByTestId("redo-button").click();
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("a = c - b");

    await page.getByTestId("undo-button").click();
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("a + b = c");

    await page.getByTestId("flip-button").click();
    await expect(page.getByText("Discard later history?")).toBeVisible();
    await page.getByRole("button", { name: "Discard and continue" }).click();
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("c = a + b");
    await expect(page.getByTestId("redo-button")).toBeDisabled();
  });

  test("copy entire history exports all equation states", async ({ page }) => {
    const equation = "a + b = c";
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await setEquation(page, equation);
    await setMoveMode(page, "additive");

    await dragByLatex(page, {
      equationLatex: equation,
      fromLatex: "b",
      toLatex: "c",
    });
    await expect
      .poll(async () => normalizeLatex(await getRenderedLatex(page)))
      .toContain("a = c - b");

    await page.getByTestId("copy-history-button").click();

    await expect
      .poll(async () => page.evaluate(() => navigator.clipboard.readText()))
      .toContain("$$ a + b = c $$");
    await expect
      .poll(async () => page.evaluate(() => navigator.clipboard.readText()))
      .toContain("$$ a = c - b $$");
  });
});
