import { expect, test } from "@playwright/test";

function normalizeLatex(s: unknown): string {
  return typeof s === "string" ? s.replace(/\s+/g, "") : "";
}

test("duplicate-to-bottom appends cloned pad and jumps to bottom", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Clear all" }).click();

  // Create enough pads to require scrolling.
  for (let i = 0; i < 6; i += 1) {
    await page.getByRole("button", { name: "Add pad" }).click();
  }

  // Seed pad-1 with known content.
  await page.getByLabel("Plain text (LaTeX)").first().click();
  await page.getByTestId("latex-input").first().fill("x=1");
  await page.getByTestId("add-update").first().click();
  await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(async () => page.evaluate(() => window.scrollY))
    .toBe(0);

  await page.getByTestId("pad-1-duplicate-to-bottom").click();

  // We should jump toward the newly appended pad.
  await expect
    .poll(async () => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);

  // Verify cloned snapshot was appended to the end.
  const stored = await page.evaluate(() => window.localStorage.getItem("derivation-pads"));
  const parsed = stored ? (JSON.parse(stored) as Array<{ snapshot?: { latex?: string } }>) : [];
  expect(parsed.length).toBe(8);
  expect(normalizeLatex(parsed[parsed.length - 1]?.snapshot?.latex)).toBe("x=1");
});
