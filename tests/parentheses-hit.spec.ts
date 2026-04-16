import { expect, test } from "@playwright/test";
import { buildTree, getNodeRects, getSelectedNodeIds, setEquation, waitForMathRender } from "./helpers/dragMathlive";

function findGroupedFactorId(equation: string): string {
  const tree = buildTree(equation);
  const grouped =
    Object.values(tree.nodesById).find(
      (n) =>
        n?.latex === String.raw`\left(v - b\right)` ||
        n?.latex === String.raw`\left(v-b\right)`
    ) ??
    Object.values(tree.nodesById).find(
      (n) =>
        n?.op === "Add" &&
        (n?.latex === String.raw`v - b` || n?.latex === String.raw`-b + v`)
    );
  if (!grouped) throw new Error(`Could not find grouped factor in: ${equation}`);
  return grouped.id;
}

test.describe("Parentheses hit selection", () => {
  test("clicking near left parenthesis selects for both P(...) and a(...)", async ({ page }) => {
    const equations = [
      String.raw`P \left(v - b\right) = R T`,
      String.raw`a \left(v - b\right) = d`,
    ];

    for (const equation of equations) {
      const groupedId = findGroupedFactorId(equation);
      await setEquation(page, equation);
      await waitForMathRender(page, [groupedId]);
      const rects = await getNodeRects(page, [groupedId]);
      const groupedRect = rects[groupedId].rect;
      const clickPoint = {
        x: groupedRect.left + 1,
        y: (groupedRect.top + groupedRect.bottom) / 2,
      };

      await page.mouse.click(clickPoint.x, clickPoint.y);

      await expect
        .poll(async () => (await getSelectedNodeIds(page)).length)
        .toBeGreaterThan(0);
    }
  });
});
