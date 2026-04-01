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

test("pointer-down on selected item does not collapse selection until click completes", async ({
  page,
}) => {
  const equation = String.raw`a + b + c = d`;
  const tree = buildTree(equation);
  const bId = Object.values(tree.nodesById).find((n) => n?.latex === "b")?.id;
  const cId = Object.values(tree.nodesById).find((n) => n?.latex === "c")?.id;
  expect(bId).toBeTruthy();
  expect(cId).toBeTruthy();

  await setEquation(page, equation);
  await waitForMathRender(page, [bId!, cId!]);
  const rects = await getNodeRects(page, [bId!, cId!]);

  const start = {
    x: rects[bId!].rect.left - 4,
    y: Math.min(rects[bId!].rect.top, rects[cId!].rect.top) - 6,
  };
  const end = {
    x: rects[cId!].rect.right + 4,
    y: Math.max(rects[bId!].rect.bottom, rects[cId!].rect.bottom) + 5,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const ids = await getSelectedNodeIds(page);
      return ids.map((id) => tree.nodesById[id]?.latex ?? "").filter(Boolean);
    })
    .toEqual(expect.arrayContaining(["b", "c"]));

  const holdPoint = rects[bId!].center;
  await page.mouse.move(holdPoint.x, holdPoint.y);
  await page.mouse.down();
  await expect
    .poll(async () => {
      const ids = await getSelectedNodeIds(page);
      return ids.map((id) => tree.nodesById[id]?.latex ?? "").filter(Boolean);
    })
    .toEqual(expect.arrayContaining(["b", "c"]));

  await page.mouse.up();
  await expect
    .poll(async () => {
      const ids = await getSelectedNodeIds(page);
      return ids.map((id) => tree.nodesById[id]?.latex ?? "").filter(Boolean);
    })
    .toEqual(["b"]);
});

test("rubber-band prefers grouped term over inner children", async ({
  page,
}) => {
  const equation = String.raw`a b + \left[c - e\right] f = 0`;
  const tree = buildTree(equation);
  const cId = Object.values(tree.nodesById).find((n) => n?.latex === "c")?.id;
  const fId = Object.values(tree.nodesById).find((n) => n?.latex === "f")?.id;
  expect(cId).toBeTruthy();
  expect(fId).toBeTruthy();

  await setEquation(page, equation);
  await waitForMathRender(page, [cId!, fId!]);
  const rects = await getNodeRects(page, [cId!, fId!]);

  const start = {
    x: rects[cId!].rect.left - 6,
    y: Math.min(rects[cId!].rect.top, rects[fId!].rect.top) - 6,
  };
  const end = {
    x: rects[fId!].rect.right + 4,
    y: Math.max(rects[cId!].rect.bottom, rects[fId!].rect.bottom) + 5,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();

  let values: string[] = [];
  await expect
    .poll(async () => {
      const ids = await getSelectedNodeIds(page);
      values = ids.map((id) => tree.nodesById[id]?.latex ?? "").filter(Boolean);
      return values.length;
    })
    .toBeGreaterThanOrEqual(2);
  expect(values).toContain("f");
  expect(
    values.some(
      (v) => v === String.raw`\left[c - e\right]` || v === String.raw`\left[c-e\right]`
    )
  ).toBe(true);
  expect(values.length).toBeGreaterThanOrEqual(2);
});

test("pointer-down on descendant of rubber-band multi-selection does not collapse until mouseup (issue 42)", async ({
  page,
}) => {
  const equation = String.raw`\frac{\mathrm{d}{P_{s}}}{\mathrm{d}{v_{s}}} = -\gamma \frac{P}{v}`;
  const tree = buildTree(equation);
  const pId = Object.values(tree.nodesById).find((n) => n?.latex === "P")?.id;
  const vId = Object.values(tree.nodesById).find((n) => n?.latex === "v")?.id;
  expect(pId).toBeTruthy();
  expect(vId).toBeTruthy();

  await setEquation(page, equation);
  await waitForMathRender(page, [pId!, vId!]);
  const rects = await getNodeRects(page, [pId!, vId!]);

  const start = {
    x: rects[pId!].rect.left - 6,
    y: Math.min(rects[pId!].rect.top, rects[vId!].rect.top) - 8,
  };
  const end = {
    x: rects[vId!].rect.right + 8,
    y: Math.max(rects[pId!].rect.bottom, rects[vId!].rect.bottom) + 8,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 14 });
  await page.mouse.up();

  const beforeIds = await getSelectedNodeIds(page);
  expect(beforeIds.length).toBeGreaterThanOrEqual(2);

  const holdPoint = rects[pId!].center;
  await page.mouse.move(holdPoint.x, holdPoint.y);
  await page.mouse.down();

  await expect
    .poll(async () => {
      const ids = await getSelectedNodeIds(page);
      return ids.length;
    })
    .toBeGreaterThanOrEqual(2);

  await page.mouse.up();
});
