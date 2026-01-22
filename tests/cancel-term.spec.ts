import { expect, test } from "@playwright/test";
import {
  setEquation,
  getRenderedLatex,
  clickNodeByLatex,
  waitForMathRender,
  buildTree,
  getNodeRects,
  getSelectedNodeIds,
} from "./helpers/dragMathlive";

function normalizeLatex(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

test.describe("Term cancellation", () => {
  test("Delete key removes a zero-equivalent term from a sum", async ({ page }) => {
    const equation = String.raw`a + \left(b - b\right) = c`;
    await setEquation(page, equation);

    await clickNodeByLatex(page, equation, String.raw`\left(b - b\right)`);
    await page.keyboard.press("Delete");

    const latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toBe("a = c");
  });

  test("toolbar button cancels the selected term", async ({ page }) => {
    const equation = String.raw`a + \left(b - b\right) = c`;
    await setEquation(page, equation);

    await clickNodeByLatex(page, equation, String.raw`\left(b - b\right)`);
    await waitForMathRender(page);
    const button = page.getByTestId("cancel-term-button");
    await expect(button).toBeEnabled();
    await button.click();

    const latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toBe("a = c");
  });

  test("ctrl/cmd+click cancels matching factors in a fraction", async ({
    page,
  }) => {
    const equation = String.raw`\ddot{x} = \frac{m g \sin\left(\theta\right)}{m}`;
    await setEquation(page, equation);

    const tree = buildTree(equation);
    const divideId = Object.values(tree.nodesById).find(
      (n) => n?.op === "Divide"
    )?.id;
    expect(divideId).toBeTruthy();
    const [numId, denId] = (divideId ? tree.childrenById[divideId] : []) ?? [];
    expect(numId).toBeTruthy();
    expect(denId).toBeTruthy();

    const isDescendant = (nodeId: string, ancestorId: string) => {
      let cur: string | undefined | null = nodeId;
      while (cur) {
        if (cur === ancestorId) return true;
        cur = tree.parentById[cur] ?? null;
      }
      return false;
    };

    const numM = Object.values(tree.nodesById).find(
      (n) => n?.latex === "m" && isDescendant(n.id, numId)
    )?.id;
    const denM = Object.values(tree.nodesById).find(
      (n) => n?.latex === "m" && isDescendant(n.id, denId)
    )?.id;

    expect(numM).toBeTruthy();
    expect(denM).toBeTruthy();

    await waitForMathRender(page, [numM!, denM!]);
    const rects = await getNodeRects(page, [numM!, denM!]);

    await page.mouse.click(rects[numM!].center.x, rects[numM!].center.y);
    const modKey = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.down(modKey);
    await page.mouse.click(rects[denM!].center.x, rects[denM!].center.y);
    await page.keyboard.up(modKey);

    const selected = await getSelectedNodeIds(page);
    expect(selected.length).toBe(2);

    await page.keyboard.press("Delete");

    const latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toBe(
      String.raw`\ddot{x} = g \sin\left(\theta\right)`
    );
  });

  test("ctrl/cmd+click cancels a common factor when the numerator is a sum", async ({
    page,
  }) => {
    const equation = String.raw`\ddot{x} = \frac{-\mu_{s} m g \cos\left(\theta\right) + m g \sin\left(\theta\right)}{m}`;
    await setEquation(page, equation);

    const tree = buildTree(equation);
    const divideId = Object.values(tree.nodesById).find((n) => n?.op === "Divide")?.id;
    expect(divideId).toBeTruthy();
    const [numId, denId] = (divideId ? tree.childrenById[divideId] : []) ?? [];
    expect(numId).toBeTruthy();
    expect(denId).toBeTruthy();

    const isDescendant = (nodeId: string, ancestorId: string) => {
      let cur: string | undefined | null = nodeId;
      while (cur) {
        if (cur === ancestorId) return true;
        cur = tree.parentById[cur] ?? null;
      }
      return false;
    };

    const numM = Object.values(tree.nodesById).find(
      (n) => n?.latex === "m" && numId && isDescendant(n.id, numId)
    )?.id;
    const denM = Object.values(tree.nodesById).find(
      (n) => n?.latex === "m" && denId && isDescendant(n.id, denId)
    )?.id;
    expect(numM).toBeTruthy();
    expect(denM).toBeTruthy();

    await waitForMathRender(page, [numM!, denM!]);
    const rects = await getNodeRects(page, [numM!, denM!]);

    await page.mouse.click(rects[numM!].center.x, rects[numM!].center.y);
    const modKey = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.down(modKey);
    await page.mouse.click(rects[denM!].center.x, rects[denM!].center.y);
    await page.keyboard.up(modKey);

    await page.keyboard.press("Delete");

    const latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toBe(
      String.raw`\ddot{x} = -\mu_{s} g \cos\left(\theta\right) + g \sin\left(\theta\right)`
    );
  });

  test("ctrl/cmd+click cancels matching additive terms across an equals sign", async ({
    page,
  }) => {
    const equation = String.raw`a + b = b + c`;
    await setEquation(page, equation);
    const tree = buildTree(equation);

    const isDescendant = (nodeId: string, ancestorId: string) => {
      let cur: string | undefined | null = nodeId;
      while (cur) {
        if (cur === ancestorId) return true;
        cur = tree.parentById[cur] ?? null;
      }
      return false;
    };

    const equalId = tree.rootId;
    const [lhsId, rhsId] = tree.childrenById[equalId] ?? [];
    const leftB = Object.values(tree.nodesById).find(
      (n) => n?.latex === "b" && lhsId && isDescendant(n.id, lhsId)
    )?.id;
    const rightB = Object.values(tree.nodesById).find(
      (n) => n?.latex === "b" && rhsId && isDescendant(n.id, rhsId)
    )?.id;
    expect(leftB).toBeTruthy();
    expect(rightB).toBeTruthy();

    await waitForMathRender(page, [leftB!, rightB!]);
    const rects = await getNodeRects(page, [leftB!, rightB!]);
    await page.mouse.click(rects[leftB!].center.x, rects[leftB!].center.y);
    const modKey = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.down(modKey);
    await page.mouse.click(rects[rightB!].center.x, rects[rightB!].center.y);
    await page.keyboard.up(modKey);

    await page.keyboard.press("Delete");
    const latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toBe("a = c");
  });

  test("ctrl/cmd+click cancels matching multiplicative factors across an equals sign", async ({
    page,
  }) => {
    const equation = String.raw`m a = m b`;
    await setEquation(page, equation);
    const tree = buildTree(equation);

    const isDescendant = (nodeId: string, ancestorId: string) => {
      let cur: string | undefined | null = nodeId;
      while (cur) {
        if (cur === ancestorId) return true;
        cur = tree.parentById[cur] ?? null;
      }
      return false;
    };

    const equalId = tree.rootId;
    const [lhsId, rhsId] = tree.childrenById[equalId] ?? [];
    const leftM = Object.values(tree.nodesById).find(
      (n) => n?.latex === "m" && lhsId && isDescendant(n.id, lhsId)
    )?.id;
    const rightM = Object.values(tree.nodesById).find(
      (n) => n?.latex === "m" && rhsId && isDescendant(n.id, rhsId)
    )?.id;
    expect(leftM).toBeTruthy();
    expect(rightM).toBeTruthy();

    await waitForMathRender(page, [leftM!, rightM!]);
    const rects = await getNodeRects(page, [leftM!, rightM!]);
    await page.mouse.click(rects[leftM!].center.x, rects[leftM!].center.y);
    const modKey = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.down(modKey);
    await page.mouse.click(rects[rightM!].center.x, rects[rightM!].center.y);
    await page.keyboard.up(modKey);

    await page.keyboard.press("Delete");
    const latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toBe("a = b");
  });

  test("ctrl/cmd+click cancels all matching factors across an equals sign with additive numerator", async ({
    page,
  }) => {
    const equation = String.raw`-\mu_{s} m g \cos\left(\theta\right) + m g \sin\left(\theta\right) = m \ddot{x}`;
    await setEquation(page, equation);

    const tree = buildTree(equation);
    const equalId = tree.rootId;
    const [lhsId, rhsId] = tree.childrenById[equalId] ?? [];

    const isDescendant = (nodeId: string, ancestorId: string) => {
      let cur: string | undefined | null = nodeId;
      while (cur) {
        if (cur === ancestorId) return true;
        cur = tree.parentById[cur] ?? null;
      }
      return false;
    };

    const lhsMs = Object.values(tree.nodesById)
      .filter((n) => n?.latex === "m" && lhsId && isDescendant(n.id, lhsId))
      .map((n) => n!.id);
    const rhsM = Object.values(tree.nodesById).find(
      (n) => n?.latex === "m" && rhsId && isDescendant(n.id, rhsId)
    )?.id;

    expect(lhsMs.length).toBeGreaterThanOrEqual(2);
    expect(rhsM).toBeTruthy();

    const allMIds = [...lhsMs, rhsM!];
    await waitForMathRender(page, allMIds);
    const rects = await getNodeRects(page, allMIds);

    const modKey = process.platform === "darwin" ? "Meta" : "Control";
    // Click first m
    await page.mouse.click(rects[allMIds[0]].center.x, rects[allMIds[0]].center.y);
    // Ctrl/Cmd click remaining
    await page.keyboard.down(modKey);
    for (let i = 1; i < allMIds.length; i += 1) {
      const id = allMIds[i];
      await page.mouse.click(rects[id].center.x, rects[id].center.y);
    }
    await page.keyboard.up(modKey);

    await page.keyboard.press("Delete");
    const latex = await getRenderedLatex(page);
    expect(normalizeLatex(latex)).toBe(
      String.raw`-\mu_{s} g \cos\left(\theta\right) + g \sin\left(\theta\right) = \ddot{x}`
    );
  });
});
