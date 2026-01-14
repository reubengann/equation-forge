import { expect, test } from "@playwright/test";

function normalizeLatex(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

test("multiplicative: drag denominator product across '=' to LHS", async ({
  page,
}) => {
  await page.goto("/");

  // Enter expression and render
  await page.getByTestId("latex-input").evaluate((el, latex) => {
    (el as any).value = latex;
  }, String.raw`x^2 + v_x = m a`);
  await page.getByTestId("add-update").click();
  await expect(page.getByTestId("info-text")).toContainText("x^2");

  // Switch to multiplicative mode
  await page.getByTestId("mode-multiplicative").click();
  // Allow MathLive to render nodes
  await page.waitForTimeout(500);

  // Locate RHS product "m a" center (fall back to child 'm')
  const startId = await page.evaluate(() => {
    const findId = (window as any).__dpFindNodeIdByLatex;
    if (typeof findId !== "function") return null;
    return findId("m a") ?? findId("m\\,a") ?? findId("m");
  });
  const start = await page.evaluate((id) => {
    const rectFor = (window as any).__dpGetRectForNodeId;
    if (!id || typeof rectFor !== "function") return null;
    const rect = rectFor(id);
    return rect && typeof rect.x === "number" && typeof rect.y === "number"
      ? rect
      : null;
  }, startId);
  if (!start) throw new Error("Could not find RHS product center");

  // Locate LHS root center using latex key
  const lhsId = await page.evaluate(() => {
    const findId = (window as any).__dpFindNodeIdByLatex;
    if (typeof findId !== "function") return null;
    return (
      findId("x^{2} + v_{x}") ??
      findId("x^2 + v_x") ??
      findId("x^{2}+v_{x}") ??
      findId("x^2+v_x")
    );
  });
  const target = await page.evaluate((id) => {
    const rectFor = (window as any).__dpGetRectForNodeId;
    if (!id || typeof rectFor !== "function") return null;
    const rect = rectFor(id);
    return rect && typeof rect.x === "number" && typeof rect.y === "number"
      ? rect
      : null;
  }, lhsId);
  if (!target) throw new Error("Could not determine target drop point");
  // Double click and drag from coordinates
  await page.mouse.click(start.x, start.y, { clickCount: 2 });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 15 });
  await page.mouse.up();

  const info = await page.getByTestId("info-text").inputValue();
  const info3 = await page.getByTestId("info3-text").inputValue();
  const infoArgs = await page.getByTestId("info-args").inputValue();
  console.log("info3", info3);
  console.log("infoArgs", infoArgs);
  expect(infoArgs).toMatch(/"mode"\s*:\s*"multiplicative"/);
  if (startId) expect(infoArgs).toContain(String(startId));
  expect(info.replace(/\s+/g, " ")).toContain("\\frac{x^{2} + v_{x}}{m a} = 1");
});

test("test2", async ({ page }) => {
  await page.goto("/");

  // Enter fraction and render
  await page.getByTestId("latex-input").evaluate((el, latex) => {
    (el as any).value = latex;
  }, String.raw`\frac{x^{2} + v_{x}}{m a} = 1`);
  await page.getByTestId("add-update").click();
  await expect(page.getByTestId("info-text")).toContainText("\\frac{x^{2}");

  await page.getByTestId("mode-multiplicative").click();
  await page.waitForTimeout(500);

  // Denominator product m a (drag source)
  const denomId = await page.evaluate(() => {
    const findId = (window as any).__dpFindNodeIdByLatex;
    if (typeof findId !== "function") return null;
    return findId("m a") ?? findId("m\\,a") ?? findId("m");
  });
  // RHS literal "1" (drop target)
  const rhsOneId = await page.evaluate(() => {
    const findId = (window as any).__dpFindNodeIdByLatex;
    return typeof findId === "function" ? findId("1") : null;
  });
  if (!rhsOneId || !denomId) throw new Error("Missing ids for drag");

  const start = await page.evaluate((id) => {
    const rectFor = (window as any).__dpGetRectForNodeId;
    if (!id || typeof rectFor !== "function") return null;
    const rect = rectFor(id);
    return rect && typeof rect.x === "number" && typeof rect.y === "number"
      ? rect
      : null;
  }, denomId);

  const target = await page.evaluate((id) => {
    const rectFor = (window as any).__dpGetRectForNodeId;
    if (!id || typeof rectFor !== "function") return null;
    const rect = rectFor(id);
    return rect && typeof rect.x === "number" && typeof rect.y === "number"
      ? rect
      : null;
  }, rhsOneId);

  if (!start || !target) throw new Error("Could not resolve drag points");

  await page.mouse.click(start.x, start.y, { clickCount: 2 });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 15 });
  await page.mouse.up();

  const info = await page.getByTestId("info-text").inputValue();
  const info3 = await page.getByTestId("info3-text").inputValue();
  const infoArgs = await page.getByTestId("info-args").inputValue();
  console.log("info3", info3);
  console.log("infoArgs", infoArgs);
  expect(infoArgs).toMatch(/"mode"\s*:\s*"multiplicative"/);
  if (denomId) expect(infoArgs).toContain(String(denomId));
  if (rhsOneId) expect(infoArgs).toContain(String(rhsOneId));
  expect(normalizeLatex(info)).toContain("x^{2} + v_{x} = m a");
});
