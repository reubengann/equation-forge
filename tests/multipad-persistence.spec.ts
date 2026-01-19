import { test, expect } from "@playwright/test";

test("multi-pad state persists across reloads", async ({ page }) => {
  const latex = "x=1";

  await page.goto("/");

  // Go to multi-pad view and reset state.
  await page.getByRole("button", { name: "Derivation (multi-pad)" }).click();
  await page.getByRole("button", { name: "Clear all" }).click();

  // Use plain-text mode for predictable input.
  await page.getByLabel("Plain text (LaTeX)").click();

  const input = page.getByTestId("latex-input").first();
  await input.fill(latex);
  await page.getByTestId("add-update").first().click();

  // Wait for render mode (Edit button appears).
  await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();

  const normalize = (s: unknown) =>
    typeof s === "string" ? s.replace(/\s+/g, "") : "";

  const stored = await page.evaluate(() => window.localStorage.getItem("derivation-pads"));
  const parsed = stored ? JSON.parse(stored) : null;
  expect(Array.isArray(parsed)).toBeTruthy();
  const snapshotLatex = normalize(parsed?.[0]?.snapshot?.latex);
  expect(snapshotLatex).toBe(normalize(latex));

  // Reload and ensure it is still there.
  await page.reload();
  await page.getByRole("button", { name: "Derivation (multi-pad)" }).click();
  await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();

  const storedAfter = await page.evaluate(() => window.localStorage.getItem("derivation-pads"));
  const parsedAfter = storedAfter ? JSON.parse(storedAfter) : null;
  expect(Array.isArray(parsedAfter)).toBeTruthy();
  const snapshotLatexAfter = normalize(parsedAfter?.[0]?.snapshot?.latex);
  expect(snapshotLatexAfter).toBe(normalize(latex));
});
