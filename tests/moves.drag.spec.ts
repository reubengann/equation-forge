import { expect, test } from "@playwright/test";
import {
  dragByLatex,
  getRenderedLatex,
  setEquation,
  setMoveMode,
  getSelectedNodeIds,
  findNodeByText,
  getExpressionJson,
} from "./helpers/dragMathlive";
import {
  buildTree,
  findNodeIdByLatex,
  getNodeRects,
  waitForMathRender,
} from "./helpers/dragMathlive";

test.setTimeout(20000);

type MoveCase = {
  title: string;
  mode: "additive" | "multiplicative";
  equation: string;
  fromLatex: string | string[];
  toLatex: string | string[];
  expectedLatex: string;
  toBias?: { dx?: number; dy?: number };
  preClick?: boolean;
  clickCount?: number;
};

function normalizeLatex(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const cases: MoveCase[] = [
  {
    title: "additive reorder within a sum",
    mode: "additive",
    equation: String.raw`a + b + c = d`,
    fromLatex: "b",
    toLatex: "c",
    expectedLatex: String.raw`a + c + b = d`,
    toBias: { dx: 6 },
  },
  {
    title:
      "additive cross '=' moves friction term product from RHS to LHS",
    mode: "additive",
    equation: String.raw`0 = \sin\left(\theta\right) - \mu_{s} \cos\left(\theta\right)`,
    fromLatex: [
      String.raw`\mu_{s} \cos\left(\theta\right)`,
      String.raw`-\mu_{s} \cos\left(\theta\right)`,
    ],
    toLatex: "0",
    expectedLatex: String.raw`\mu_{s} \cos\left(\theta\right) = \sin\left(\theta\right)`,
    clickCount: 2,
  },
  {
    title: "additive cross '=' wraps into other side with sign flip",
    mode: "additive",
    equation: String.raw`a + b = c`,
    fromLatex: "b",
    toLatex: "c",
    expectedLatex: String.raw`a = c - b`,
  },
  {
    title: "additive cross '=' flips negated term",
    mode: "additive",
    equation: String.raw`a - b = c`,
    fromLatex: "b",
    toLatex: "c",
    expectedLatex: String.raw`a = c + b`,
  },
  {
    title: "multiplicative cross '=' moves factor to denominator",
    mode: "multiplicative",
    equation: String.raw`a = b c`,
    fromLatex: "b",
    toLatex: "a",
    // Bias to the right to avoid hitting the left edge zone of small "a" target
    toBias: { dx: 8 },
    expectedLatex: String.raw`\frac{a}{b} = c`,
  },
  {
    title: "multiplicative cross '=' moves denominator to lhs",
    mode: "multiplicative",
    equation: String.raw`a = \frac{c}{b}`,
    fromLatex: "b",
    toLatex: "a",
    // Factor order can vary (a b or b a), both are mathematically equivalent
    expectedLatex: String.raw`(a b|b a) = c`,
  },
  {
    title: "multiplicative reorder within a product container",
    mode: "multiplicative",
    equation: String.raw`1 = a b c`,
    fromLatex: "b",
    toLatex: "a",
    expectedLatex: String.raw`1 = b a c`,
    toBias: { dx: -10 },
    preClick: false,
  },
  {
    title: "multiplicative cross '=' moves scalar leaving vector factor",
    mode: "multiplicative",
    equation: String.raw`\vec{F} = m \vec{a}`,
    fromLatex: "m",
    toLatex: String.raw`\vec{F}`,
    expectedLatex: String.raw`\frac{\vec{F}}{m} = \vec{a}`,
  },
  {
    title: "multiplicative merge factor into fraction numerator",
    mode: "multiplicative",
    equation: String.raw`\vec{F} \frac{1}{m} = \vec{a}`,
    fromLatex: String.raw`\vec{F}`,
    toLatex: "1",
    expectedLatex: String.raw`\frac{\vec{F}}{m} = \vec{a}`,
    toBias: { dy: -4 },
  },
  {
    title: "multiplicative factor out of integral to the left",
    mode: "multiplicative",
    equation: String.raw`v = 2 g \int_{0}^{x_{0}} \sin\left(\theta\right) \,\mathrm{d}{x}`,
    fromLatex: String.raw`\sin\left(\theta\right)`,
    toLatex: String.raw`\int_{0}^{x_{0}} \sin\left(\theta\right) \,\mathrm{d}{x}`,
    expectedLatex: String.raw`v = 2 g \sin\left(\theta\right) \int_{0}^{x_{0}} \,\mathrm{d}{x}`,
    toBias: { dx: -20 },
  },
  {
    title: "multiplicative factor out of integral to the right",
    mode: "multiplicative",
    equation: String.raw`v = 2 g \int_{0}^{x_{0}} \sin\left(\theta\right) \,\mathrm{d}{x}`,
    fromLatex: String.raw`\sin\left(\theta\right)`,
    toLatex: String.raw`\int_{0}^{x_{0}} \sin\left(\theta\right) \,\mathrm{d}{x}`,
    expectedLatex: String.raw`v = 2 g \int_{0}^{x_{0}} \,\mathrm{d}{x} \sin\left(\theta\right)`,
    toBias: { dx: 20 },
  },
  {
    title: "additive move of multiplicative product across '='",
    mode: "additive",
    equation: String.raw`x^{2} + v_{x} = m a`,
    fromLatex: "m a",
    toLatex: "x^{2}",
    expectedLatex: String.raw`x^{2} - m a + v_{x} = 0`,
    clickCount: 2, // double-click to select the product
  },
  {
    title:
      "multiplicative cross '=' moves cos alone, leaving mu on LHS",
    mode: "multiplicative",
    equation: String.raw`\mu_{s} \cos\left(\theta\right) = \sin\left(\theta\right)`,
    fromLatex: String.raw`\cos\left(\theta\right)`,
    toLatex: String.raw`\sin\left(\theta\right)`,
    expectedLatex: String.raw`\mu_{s} = \frac{\sin\left(\theta\right)}{\cos\left(\theta\right)}`,
  },
  // Regression: manual double-click on μ_s then drag should also work
  // even if the selection starts from the μ factor instead of the whole product.
];

for (const c of cases) {
  test(`moves: ${c.title}`, async ({ page }) => {
    await setEquation(page, c.equation);
    await setMoveMode(page, c.mode);

    const drag = await dragByLatex(page, {
      equationLatex: c.equation,
      fromLatex: c.fromLatex,
      toLatex: c.toLatex,
      toBias: c.toBias,
      preClick: c.preClick,
      clickCount: c.clickCount,
    });

    const latex = await getRenderedLatex(page);
    const normalizedLatex = normalizeLatex(latex);
    // If expectedLatex contains regex pattern (e.g., "(a b|b a)"), use regex match, otherwise use substring
    if (
      c.expectedLatex.includes("|") &&
      c.expectedLatex.startsWith("(") &&
      c.expectedLatex.includes(")")
    ) {
      const regex = new RegExp(c.expectedLatex);
      expect(normalizedLatex).toMatch(regex);
    } else {
      expect(normalizedLatex).toContain(normalizeLatex(c.expectedLatex));
    }
    const infoArgs = await page.getByTestId("info-args").inputValue();
    expect(infoArgs).toMatch(new RegExp(`"mode"\\s*:\\s*"${c.mode}"`));
  });
}

// Helper to get selection range value from the UI
async function getSelectionRange(page: any): Promise<string> {
  // Find the input field next to the "Range / span" label
  // The label and input are in a div structure: <div><label>Range / span</label><input /></div>
  const label = page.getByText("Range / span");
  // Get the parent div that contains both label and input
  const parentDiv = label.locator("..");
  const input = parentDiv.locator("input");
  const value = await input.inputValue();
  return value.trim();
}

test("double-click m should show span selection [0..1] of 2", async ({
  page,
}) => {
  const equation = String.raw`x^{2} + v_{x} = m a`;
  await setEquation(page, equation);
  await setMoveMode(page, "additive");

  // Build tree to find node IDs
  const tree = buildTree(equation);
  const mId = findNodeIdByLatex(tree, "m");

  // Wait for rendering
  await waitForMathRender(page, [mId]);
  const rects = await getNodeRects(page, [mId]);
  const mCenter = rects[mId].center;

  // Step 1: Double-click on "m" to select "m a"
  // This should create a multiplicative span selection showing [0..1] of 2
  // Simulate double-click with two separate clicks within 600ms window
  await page.mouse.click(mCenter.x, mCenter.y);
  await page.waitForTimeout(100); // Delay within 600ms window for click counting
  await page.mouse.click(mCenter.x, mCenter.y);

  // Small delay to ensure selection is processed
  await page.waitForTimeout(100);

  // Verify the range/span display shows [0..1] of 2
  const range = await getSelectionRange(page);
  expect(range).toBe("[0..1] of 2");
});

test("mousedown after double-click should not change span selection", async ({
  page,
}) => {
  const equation = String.raw`x^{2} + v_{x} = m a`;
  await setEquation(page, equation);
  await setMoveMode(page, "additive");

  // Build tree to find node IDs
  const tree = buildTree(equation);
  const mId = findNodeIdByLatex(tree, "m");

  // Wait for rendering
  await waitForMathRender(page, [mId]);
  const rects = await getNodeRects(page, [mId]);
  const mCenter = rects[mId].center;

  // Step 1: Double-click on "m" to select "m a"
  // Simulate double-click with two separate clicks within 600ms window
  await page.mouse.click(mCenter.x, mCenter.y);
  await page.waitForTimeout(100); // Delay within 600ms window for click counting
  await page.mouse.click(mCenter.x, mCenter.y);
  await page.waitForTimeout(100);

  // Verify initial range
  const initialRange = await getSelectionRange(page);
  expect(initialRange).toBe("[0..1] of 2");

  // Step 2: Mouse down (but not up) on "m"
  // This should NOT change the selection range
  await page.mouse.move(mCenter.x, mCenter.y);
  await page.mouse.down();

  // Small delay to allow any state updates
  await page.waitForTimeout(100);

  // Verify the range is still [0..1] of 2
  const rangeAfterMouseDown = await getSelectionRange(page);
  expect(rangeAfterMouseDown).toBe("[0..1] of 2");

  // Clean up: release mouse
  await page.mouse.up();
});

test("double-click m then drag to LHS should move m a additively", async ({
  page,
}) => {
  const equation = String.raw`x^{2} + v_{x} = m a`;
  await setEquation(page, equation);
  await setMoveMode(page, "additive");

  // Build tree to find node IDs
  const tree = buildTree(equation);
  const mId = findNodeIdByLatex(tree, "m");
  const x2Id = findNodeIdByLatex(tree, "x^{2}");

  // Wait for rendering
  await waitForMathRender(page, [mId, x2Id]);
  const rects = await getNodeRects(page, [mId, x2Id]);

  const mCenter = rects[mId].center;
  const x2Center = rects[x2Id].center;

  // Step 1: Double-click on "m" to select "m a"
  // This should promote the selection to the product container "m a"
  // Simulate double-click with two separate clicks within 600ms window
  await page.mouse.click(mCenter.x, mCenter.y);
  await page.waitForTimeout(100); // Delay within 600ms window for click counting
  await page.mouse.click(mCenter.x, mCenter.y);

  // Small delay to ensure selection is processed
  await page.waitForTimeout(100);

  // Step 2: Click and drag from "m" to LHS (x^2)
  // This simulates clicking on already-selected "m a" to start dragging.
  // The issue: this click might re-select just "m" instead of keeping "m a" selected.
  // If that happens, the planner will see just "m" (a factor), and even with promotion
  // logic, it might not work correctly if the selection state is inconsistent.
  await page.mouse.click(mCenter.x, mCenter.y);
  await page.mouse.down();
  // Drag to x^2 on LHS
  await page.mouse.move(x2Center.x, x2Center.y, { steps: 15 });
  await page.mouse.up();

  // Step 3: Verify result - should be x^2 + v_x - m a = 0 (or similar)
  // This test should FAIL if the click re-selects just "m" and the move planner rejects it.
  // The expected behavior: after double-clicking "m" to select "m a", clicking again to start
  // the drag should reuse the "m a" selection, not re-select just "m".
  const latex = await getRenderedLatex(page);
  const normalizedLatex = normalizeLatex(latex);

  // If the move planner rejected the move, the equation should be unchanged
  // If the move worked, it should contain the negated m a term and 0 on RHS
  const hasNegatedMa = normalizedLatex.match(/-.*m.*a/);
  const hasZeroOnRhs = normalizedLatex.includes("= 0");

  // The move should have occurred (m a should have been moved and negated)
  expect(hasNegatedMa).not.toBeNull();
  expect(hasZeroOnRhs).toBe(true);

  // Check for key components (order may vary)
  expect(normalizedLatex).toContain("x^{2}");
  expect(normalizedLatex).toContain("v_{x}");
  // Verify it's not the original equation
  expect(normalizedLatex).not.toContain("x^{2} + v_{x} = m a");
});

test("double-click mu then drag friction term to LHS additively", async ({
  page,
}) => {
  const equation = String.raw`0 = \sin\left(\theta\right) - \mu_{s} \cos\left(\theta\right)`;
  await setEquation(page, equation);
  await setMoveMode(page, "additive");

  const tree = buildTree(equation);
  const muId = findNodeIdByLatex(tree, String.raw`\mu_{s}`);
  const zeroId = findNodeIdByLatex(tree, "0");

  await waitForMathRender(page, [muId, zeroId]);
  const rects = await getNodeRects(page, [muId, zeroId]);
  const muCenter = rects[muId].center;
  const zeroCenter = rects[zeroId].center;

  // Manual-style double-click: two clicks, then press/drag
  await page.mouse.click(muCenter.x, muCenter.y);
  await page.waitForTimeout(80);
  await page.mouse.click(muCenter.x, muCenter.y);
  await page.waitForTimeout(80);

  await page.mouse.move(muCenter.x, muCenter.y);
  await page.mouse.down();
  await page.mouse.move(zeroCenter.x, zeroCenter.y, { steps: 15 });
  await page.mouse.up();

  const latex = await getRenderedLatex(page);
  const normalized = normalizeLatex(latex);
  expect(normalized).toContain(
    normalizeLatex(
      String.raw`\mu_{s} \cos\left(\theta\right) = \sin\left(\theta\right)`
    )
  );
});

test("additive cross '=' keeps moved product selectable", async ({ page }) => {
  const equation = String.raw`\vec{F} = m \vec{a}`;
  await setEquation(page, equation);
  await setMoveMode(page, "additive");

  await dragByLatex(page, {
    equationLatex: equation,
    fromLatex: "m",
    toLatex: String.raw`\vec{F}`,
    clickCount: 2,
  });

  const finalLatex = await getRenderedLatex(page);
  expect(normalizeLatex(finalLatex)).toContain(
    normalizeLatex(String.raw`\vec{F} - m \vec{a} = 0`)
  );

  await waitForMathRender(page);
  const mNode = await findNodeByText(page, "m");
  expect(mNode).not.toBeNull();
  const mCenter = mNode!.center;

  await page.mouse.click(mCenter.x, mCenter.y);
  await page.waitForTimeout(50);

  const selectedIds = await getSelectedNodeIds(page);
  expect(selectedIds.length).toBeGreaterThan(0);
});

test("multiplicative factor-out produces flat product MathJSON", async ({
  page,
}) => {
  const equation = String.raw`v = 2 g \int_{0}^{x_{0}} \sin\left(\theta\right) \,\mathrm{d}{x}`;
  await setEquation(page, equation);
  await setMoveMode(page, "multiplicative");

  await dragByLatex(page, {
    equationLatex: equation,
    fromLatex: String.raw`\sin\left(\theta\right)`,
    toLatex: String.raw`\int_{0}^{x_{0}} \sin\left(\theta\right) \,\mathrm{d}{x}`,
    toBias: { dx: -20 },
  });

  await waitForMathRender(page);
  const json = await getExpressionJson(page);
  expect(json[0]).toBe("Equal");
  const rhs = json[2];
  expect(rhs[0]).toBe("InvisibleOperator");
  // Should flatten to 2, g, sin(theta), Integrate(1, ...)
  const factors = rhs.slice(1);
  expect(factors.some((f: any) => f === 2)).toBe(true);
  expect(factors.some((f: any) => f === "g")).toBe(true);
  const hasSin = factors.some((f: any) => Array.isArray(f) && f[0] === "Sin");
  if (!hasSin) {
    // Aid debugging in CI when the factor isn't found.
    // eslint-disable-next-line no-console
    console.log("Factor-out JSON", JSON.stringify(json, null, 2));
  }
  expect(hasSin).toBe(true);
  expect(
    factors.some(
      (f: any) => Array.isArray(f) && f[0] === "Integrate" && f[1] === 1
    )
  ).toBe(true);
  // Ensure no nested InvisibleOperator remains
  expect(
    factors.every(
      (f: any) =>
        !(Array.isArray(f) && (f[0] === "InvisibleOperator" || f[0] === "Multiply"))
    )
  ).toBe(true);
});
