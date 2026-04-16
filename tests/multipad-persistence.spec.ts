import { test, expect } from "@playwright/test";

test("multi-pad state persists across reloads", async ({ page }) => {
  const latexV1 = "x=1";
  const latexV2 = "x=2";

  await page.goto("/");

  // Go to multi-pad view and reset state.
  await page.getByRole("button", { name: "Derivation (multi-pad)" }).click();
  await page.getByRole("button", { name: "Clear all" }).click();

  // Use plain-text mode for predictable input.
  await page.getByLabel("Plain text (LaTeX)").click();

  const input = page.getByTestId("latex-input").first();
  await input.fill(latexV1);
  await page.getByTestId("add-update").first().click();
  await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).first().click();
  await input.fill(latexV2);
  await page.getByTestId("add-update").first().click();
  await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();

  const normalize = (s: unknown) =>
    typeof s === "string" ? s.replace(/\s+/g, "") : "";

  await expect
    .poll(async () => {
      const raw = await page.evaluate(() =>
        window.localStorage.getItem("derivation-pads")
      );
      if (!raw) return "";
      const saved = JSON.parse(raw);
      return normalize(saved?.[0]?.history?.present?.latex);
    })
    .toBe(normalize(latexV2));

  const stored = await page.evaluate(() =>
    window.localStorage.getItem("derivation-pads")
  );
  const parsed = stored ? JSON.parse(stored) : null;
  expect(Array.isArray(parsed)).toBeTruthy();
  expect(Array.isArray(parsed?.[0]?.history?.past)).toBeTruthy();
  expect(normalize(parsed?.[0]?.snapshot?.latex)).toBe(normalize(latexV2));

  // Reload and ensure it is still there.
  await page.reload();
  await page.getByRole("button", { name: "Derivation (multi-pad)" }).click();
  await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();
  await page.getByTestId("undo-button").first().click();
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() =>
        window.localStorage.getItem("derivation-pads")
      );
      if (!raw) return "";
      const saved = JSON.parse(raw);
      return saved?.[0]?.history?.present?.latex ?? "";
    })
    .toBe(latexV1);
  await page.getByTestId("redo-button").first().click();
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() =>
        window.localStorage.getItem("derivation-pads")
      );
      if (!raw) return "";
      const saved = JSON.parse(raw);
      return normalize(saved?.[0]?.history?.present?.latex);
    })
    .toBe(normalize(latexV2));

  const storedAfter = await page.evaluate(() => window.localStorage.getItem("derivation-pads"));
  const parsedAfter = storedAfter ? JSON.parse(storedAfter) : null;
  expect(Array.isArray(parsedAfter)).toBeTruthy();
  const snapshotLatexAfter = normalize(parsedAfter?.[0]?.snapshot?.latex);
  expect(snapshotLatexAfter).toBe(normalize(latexV2));
  expect(normalize(parsedAfter?.[0]?.history?.present?.latex)).toBe(
    normalize(latexV2),
  );
});
