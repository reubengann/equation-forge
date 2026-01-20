import { expect, test } from "@playwright/test";
import { ExpressionTree } from "../src/ExpressionTree";
import { cancelTerm } from "../src/cancelTerm";
import { getNodeRects, getSelectedNodeIds, waitForMathRender } from "./helpers/dragMathlive";

const MULTIPAD_STORAGE = [
  {
    id: "pad-1",
    snapshot: {
      latex: String.raw`\vec{F}=\vec{F}_{g}+\vec{N}`,
      rootJson: [
        "Equal",
        ["Vector", "F"],
        ["Add", ["Subscript", ["Vector", "F"], "g"], ["Vector", "N"]],
      ],
    },
  },
  {
    id: "pad-2",
    snapshot: {
      latex: String.raw`\vec{F}_{g} + \vec{N} = m \ddot{\vec{r}}`,
      rootJson: [
        "Equal",
        ["Add", ["Subscript", ["Vector", "F"], "g"], ["Vector", "N"]],
        ["InvisibleOperator", "m", ["OverDot", ["Vector", "r"], 2]],
      ],
    },
  },
  {
    id: "pad-3",
    snapshot: {
      latex: String.raw`-F_{s} \cos\left(\theta\right) + N = 0`,
      rootJson: [
        "Equal",
        [
          "Add",
          ["Negate", ["InvisibleOperator", ["Subscript", "F", "s"], ["Cos", "theta"]]],
          "N",
        ],
        0,
      ],
    },
  },
  {
    id: "pad-4",
    snapshot: {
      latex: String.raw`\ddot{x} = \frac{m g \sin\left(\theta\right)}{m}`,
      rootJson: [
        "Equal",
        ["OverDot", "x", 2],
        [
          "Divide",
          ["InvisibleOperator", ["InvisibleOperator", "m", "g"], ["Sin", "theta"]],
          "m",
        ],
      ],
    },
  },
];

function normalizeLatex(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

test("multi-pad ctrl/cmd multi-select cancels matching fraction factors", async ({ page }) => {
  await page.goto("/");

  await page.evaluate((data) => {
    window.localStorage.setItem("derivation-pads", JSON.stringify(data));
  }, MULTIPAD_STORAGE);

  await page.reload();
  await page.getByRole("button", { name: "Derivation (multi-pad)" }).click();
  await expect(page.locator('[data-testid="math-display"]')).toHaveCount(4);

  const tree = ExpressionTree.create(MULTIPAD_STORAGE[3].snapshot.rootJson as any);

  const divideId = Object.values(tree.nodesById).find((n) => n?.op === "Divide")?.id;
  expect(divideId).toBeTruthy();
  const [numId, denId] = (divideId ? tree.childrenById[divideId] : []) ?? [];
  expect(numId).toBeTruthy();
  expect(denId).toBeTruthy();

  const numeratorKids = tree.childrenById[numId] ?? [];
  const productId = numeratorKids.find((cid) => tree.nodesById[cid]?.op === "InvisibleOperator");
  const productKids = productId ? tree.childrenById[productId] ?? [] : [];
  const numM =
    numeratorKids.find((cid) => tree.nodesById[cid]?.latex === "m") ??
    productKids.find((cid) => tree.nodesById[cid]?.latex === "m");
  const denM =
    tree.nodesById[denId]?.latex === "m"
      ? denId
      : (tree.childrenById[denId] ?? []).find((cid) => tree.nodesById[cid]?.latex === "m");

  expect(numM).toBeTruthy();
  expect(denM).toBeTruthy();

  const displayIndex = 3; // pad-4 (0-based)
  const host = page.getByTestId("math-display").nth(displayIndex);
  await host.scrollIntoViewIfNeeded();

  // Debug mapping of m nodes (kept for clarity in assertions)
  // console.log(
  //   Object.values(tree.nodesById)
  //     .filter((n) => n?.latex === "m")
  //     .map((n) => ({
  //       id: n?.id,
  //       parent: tree.parentById[n?.id ?? ""],
  //       parentOp: tree.nodesById[tree.parentById[n?.id ?? ""] ?? ""]?.op,
  //     }))
  // );

  await waitForMathRender(page, [numM!, denM!], displayIndex);
  const rects = await getNodeRects(page, [numM!, denM!], displayIndex);

  // Select both m factors with modifier
  await page.mouse.click(rects[numM!].center.x, rects[numM!].center.y);
  await expect
    .poll(async () => {
      const ids = await getSelectedNodeIds(page, displayIndex);
      return ids.map((id) => tree.nodesById[id]?.latex ?? "");
    })
    .toEqual(["m"]);

  const modKey = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.down(modKey);
  await page.mouse.click(rects[denM!].center.x, rects[denM!].center.y);
  await page.keyboard.up(modKey);

  await expect
    .poll(async () => {
      const ids = await getSelectedNodeIds(page, displayIndex);
      const latexes = ids.map((id) => tree.nodesById[id]?.latex ?? "");
      return latexes;
    })
    .toEqual(["m", "m"]);

  const selectedIds = await getSelectedNodeIds(page, displayIndex);
  const offlineCancel = cancelTerm(tree, { kind: "multi", nodeIds: selectedIds as string[] });
  expect(offlineCancel).not.toBeNull();

  const cancelBtn = page.getByTestId("cancel-term-button").nth(displayIndex);
  await expect(cancelBtn).toBeEnabled();

  await page.keyboard.press("Delete");

  await expect.poll(async () => {
    const stored = await page.evaluate(() =>
      window.localStorage.getItem("derivation-pads")
    );
    if (!stored) return "";
    const parsed = JSON.parse(stored) as any[];
    const pad4 = parsed.find((p) => p.id === "pad-4");
    return normalizeLatex(pad4?.snapshot?.latex ?? "");
  }).toBe(String.raw`\ddot{x} = g \sin\left(\theta\right)`);
});
