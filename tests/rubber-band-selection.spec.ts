import { expect, test } from "@playwright/test";
import {
  buildTree,
  dragByLatex,
  getNodeRects,
  getRenderedLatex,
  getSelectedNodeIds,
  setEquation,
  waitForMathRender,
} from "./helpers/dragMathlive";

function normalizeLatex(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

test("background drag creates multi-selection and tiny background click clears", async ({
  page,
}) => {
  const equation = String.raw`a + b + c = d`;
  const tree = buildTree(equation);
  const aId = Object.values(tree.nodesById).find((n) => n?.latex === "a")?.id;
  const bId = Object.values(tree.nodesById).find((n) => n?.latex === "b")?.id;
  const cId = Object.values(tree.nodesById).find((n) => n?.latex === "c")?.id;

  expect(aId).toBeTruthy();
  expect(bId).toBeTruthy();
  expect(cId).toBeTruthy();

  await setEquation(page, equation);
  await waitForMathRender(page, [aId!, bId!, cId!]);
  const rects = await getNodeRects(page, [aId!, bId!, cId!]);

  const start = {
    x: (rects[aId!].rect.right + rects[bId!].rect.left) / 2,
    y: Math.min(rects[bId!].rect.top, rects[cId!].rect.top) - 6,
  };
  const end = {
    x: rects[cId!].rect.right + 4,
    y: Math.max(rects[bId!].rect.bottom, rects[cId!].rect.bottom) + 4,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const ids = await getSelectedNodeIds(page);
      return ids
        .map((id) => tree.nodesById[id]?.latex ?? "")
        .filter(Boolean)
        .sort();
    })
    .toEqual(["b", "c"]);

  await page.mouse.click(rects[bId!].center.x, rects[bId!].center.y);
  await expect
    .poll(async () => {
      const ids = await getSelectedNodeIds(page);
      return ids.map((id) => tree.nodesById[id]?.latex ?? "").filter(Boolean);
    })
    .toEqual(["b"]);

  const clearPoint = await page.evaluate(() => {
    const host = document.querySelector(
      '[data-testid="math-display"]'
    ) as HTMLElement | null;
    const renderBox = host?.closest('[tabindex="0"]') as HTMLElement | null;
    if (!renderBox) return null;
    const r = renderBox.getBoundingClientRect();
    return { x: r.left + 8, y: r.top + 8 };
  });
  expect(clearPoint).toBeTruthy();

  await page.mouse.click(clearPoint!.x, clearPoint!.y);
  await expect.poll(async () => await getSelectedNodeIds(page)).toEqual([]);
});

test("plain node drag still performs move (not marquee)", async ({ page }) => {
  const equation = String.raw`a + b + c = d`;
  await setEquation(page, equation);

  await dragByLatex(page, {
    equationLatex: equation,
    fromLatex: "b",
    toLatex: "c",
    toBias: { dx: 6 },
  });

  await expect
    .poll(async () => normalizeLatex(await getRenderedLatex(page)))
    .toBe(String.raw`a + c + b = d`);
});
