import { type Page } from "@playwright/test";
import { ExpressionTree } from "../../src/ExpressionTree";
import { parse } from "../../src/computeEngine";

type LatexMatch = string | string[];
type Point = { x: number; y: number };
type Rect = { left: number; right: number; top: number; bottom: number };

export type DragByLatexParams = {
  equationLatex: string;
  fromLatex: LatexMatch;
  toLatex: LatexMatch;
  toBias?: { dx?: number; dy?: number };
  clickCount?: number;
  preClick?: boolean;
};

function asCandidates(match: LatexMatch): string[] {
  return Array.isArray(match) ? match : [match];
}

export function buildTree(latex: string): ExpressionTree {
  const mj = parse(latex);
  if (!mj) throw new Error(`Failed to parse LaTeX: ${latex}`);
  return ExpressionTree.create(mj as any);
}

export function findNodeIdByLatex(
  tree: ExpressionTree,
  match: LatexMatch
): string {
  const candidates = asCandidates(match);
  for (const candidate of candidates) {
    const node = Object.values(tree.nodesById).find(
      (n) => n?.latex === candidate
    );
    if (node) return node.id;
  }
  throw new Error(`Node not found for latex: ${candidates.join(" | ")}`);
}

function applyBias(point: Point, bias?: { dx?: number; dy?: number }): Point {
  return {
    x: point.x + (bias?.dx ?? 0),
    y: point.y + (bias?.dy ?? 0),
  };
}

export async function waitForMathRender(
  page: Page,
  nodeIds: string[] = [],
  displayIndex = 0
) {
  await page.waitForSelector('[data-testid="math-display"]');
  await page.waitForFunction(
    ({ nodeIds, displayIndex }) => {
      const hosts = Array.from(
        document.querySelectorAll(
          '[data-testid="math-display"]'
        ) as NodeListOf<HTMLElement>
      );
      const host = hosts[displayIndex];
      if (!host) return false;
      const sr = host.shadowRoot ?? (host as any).shadowRoot;
      if (!sr) return false;
      if (!sr.querySelector("[data-node-id]")) return false;

      const rectFor = (id: string) => {
        const els = sr.querySelectorAll(
          `[data-node-id="${CSS.escape(id)}"]`
        ) as NodeListOf<HTMLElement>;
        if (!els.length) return null;
        let left = Infinity;
        let right = -Infinity;
        let top = Infinity;
        let bottom = -Infinity;
        for (const el of els) {
          const r = el.getBoundingClientRect();
          left = Math.min(left, r.left);
          right = Math.max(right, r.right);
          top = Math.min(top, r.top);
          bottom = Math.max(bottom, r.bottom);
        }
        if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
        return { left, right, top, bottom };
      };

      for (const id of nodeIds) {
        if (!rectFor(id)) return false;
      }
      return true;
    },
    { nodeIds, displayIndex },
    { timeout: 4000 }
  );
}

export async function getNodeRects(
  page: Page,
  nodeIds: string[],
  displayIndex = 0
): Promise<Record<string, { rect: Rect; center: Point }>> {
  const handle = await page.waitForFunction(
    ({ nodeIds, displayIndex }) => {
      const hosts = Array.from(
        document.querySelectorAll(
          '[data-testid="math-display"]'
        ) as NodeListOf<HTMLElement>
      );
      const host = hosts[displayIndex];
      if (!host) return null;
      const sr = host.shadowRoot ?? (host as any).shadowRoot;
      if (!sr) return null;

      const rectFor = (id: string) => {
        const els = sr.querySelectorAll(
          `[data-node-id="${CSS.escape(id)}"]`
        ) as NodeListOf<HTMLElement>;
        if (!els.length) return null;
        let left = Infinity;
        let right = -Infinity;
        let top = Infinity;
        let bottom = -Infinity;
        for (const el of els) {
          const r = el.getBoundingClientRect();
          left = Math.min(left, r.left);
          right = Math.max(right, r.right);
          top = Math.min(top, r.top);
          bottom = Math.max(bottom, r.bottom);
        }
        if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
        const rect = { left, right, top, bottom };
        const center = {
          x: (left + right) / 2,
          y: (top + bottom) / 2,
        };
        return { rect, center };
      };

      const result: Record<string, { rect: Rect; center: Point }> = {};
      for (const id of nodeIds) {
        const rect = rectFor(id);
        if (!rect) return null;
        result[id] = rect;
      }
      return result;
    },
    { nodeIds, displayIndex },
    { timeout: 4000 }
  );

  const rects = await handle?.jsonValue();
  if (!rects) {
    throw new Error(`Could not resolve rects for ids: ${nodeIds.join(", ")}`);
  }
  return rects as Record<string, { rect: Rect; center: Point }>;
}

export async function setEquation(page: Page, latex: string) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.removeItem("debug-pad-history"));
  await page.reload();
  await page.getByRole("button", { name: "Debug (single pad)" }).click();
  await page.locator('input[name="entry-mode"][value="text"]').click();
  await page.getByTestId("latex-input").fill(latex);
  await page.getByTestId("add-update").click();
  await waitForMathRender(page);
}

export async function setMoveMode(
  page: Page,
  mode: "additive" | "multiplicative"
) {
  await page.getByTestId(`mode-${mode}`).click();
  await waitForMathRender(page);
}

export async function dragByLatex(page: Page, params: DragByLatexParams) {
  const tree = buildTree(params.equationLatex);
  const fromId = findNodeIdByLatex(tree, params.fromLatex);
  const toId = findNodeIdByLatex(tree, params.toLatex);

  await waitForMathRender(page, [fromId, toId]);
  const rects = await getNodeRects(page, [fromId, toId]);

  const start = rects[fromId].center;
  const target = applyBias(rects[toId].center, params.toBias);

  const clickCount = params.clickCount ?? 1;

  // We want the drag-start press to count as the final click in the sequence.
  // For single-click drags this avoids generating an extra click before we hold
  // the mouse down (which previously caused accidental double-click promotion).
  // For double-click drags we issue the first click normally, then press-and-hold
  // for the second click so the drag begins with that second click.
  await page.mouse.move(start.x, start.y);
  if (params.preClick !== false && clickCount > 1) {
    const prepClicks = clickCount - 1;
    for (let i = 0; i < prepClicks; i += 1) {
      await page.mouse.click(start.x, start.y);
    }
    await page.mouse.down({ clickCount });
  } else {
    await page.mouse.down({ clickCount: 1 });
  }
  await page.mouse.move(target.x, target.y, { steps: 15 });
  await page.mouse.up();

  return {
    fromId,
    toId,
    fromLatex: tree.nodesById[fromId]?.latex,
    toLatex: tree.nodesById[toId]?.latex,
    start,
    target,
  };
}

export async function getRenderedLatex(page: Page): Promise<string> {
  const locator = page.getByTestId("info-text");
  if (await locator.isEditable()) {
    return (await locator.inputValue()).trim();
  }

  const tagName = await locator.evaluate((el) => el.tagName);
  if (
    tagName?.toLowerCase() === "input" ||
    tagName?.toLowerCase() === "textarea"
  ) {
    return (await locator.inputValue()).trim();
  }

  return (await locator.innerText()).trim();
}

export async function getExpressionJson(page: Page): Promise<any> {
  const locator = page.locator("#dp-expression-json");
  const jsonText = await locator.inputValue();
  return JSON.parse(jsonText);
}

export async function clickNodeByLatex(
  page: Page,
  equationLatex: string,
  match: LatexMatch,
  displayIndex = 0
) {
  const tree = buildTree(equationLatex);
  const nodeId = findNodeIdByLatex(tree, match);
  await waitForMathRender(page, [nodeId], displayIndex);
  const rects = await getNodeRects(page, [nodeId], displayIndex);
  const pt = rects[nodeId].center;
  await page.mouse.click(pt.x, pt.y);
  return { nodeId, point: pt };
}

export async function getSelectedNodeIds(
  page: Page,
  displayIndex = 0
): Promise<string[]> {
  const ids = await page.evaluate((index) => {
    const hosts = Array.from(
      document.querySelectorAll(
        '[data-testid="math-display"]'
      ) as NodeListOf<HTMLElement>
    );
    const host = hosts[index];
    const sr = host?.shadowRoot ?? (host as any)?.shadowRoot;
    if (!sr) return [];
    const els = Array.from(
      sr.querySelectorAll<HTMLElement>(".dp-selected")
    ) as HTMLElement[];
    const set = new Set<string>();
    for (const el of els) {
      const id = el.dataset?.nodeId;
      if (id) set.add(id);
    }
    return Array.from(set);
  }, displayIndex);
  return ids;
}

export async function findDomNodeIdByText(
  page: Page,
  targetText: string
): Promise<string | null> {
  return await page.evaluate((needle) => {
    const host = document.querySelector(
      '[data-testid="math-display"]'
    ) as HTMLElement | null;
    const sr = host?.shadowRoot ?? (host as any)?.shadowRoot;
    if (!sr) return null;
    const nodes = Array.from(
      sr.querySelectorAll<HTMLElement>("[data-node-id]")
    ) as HTMLElement[];
    for (const n of nodes) {
      const text = (n.textContent ?? "").trim();
      if (text === needle) return n.dataset?.nodeId ?? null;
    }
    return null;
  }, targetText);
}

export async function findNodeByText(
  page: Page,
  targetText: string
): Promise<{ id: string; center: Point } | null> {
  const result = await page.evaluate((needle) => {
    const host = document.querySelector(
      '[data-testid="math-display"]'
    ) as HTMLElement | null;
    const sr = host?.shadowRoot ?? (host as any)?.shadowRoot;
    if (!sr) return null;
    const nodes = Array.from(
      sr.querySelectorAll<HTMLElement>("[data-node-id]")
    ) as HTMLElement[];
    for (const n of nodes) {
      const text = (n.textContent ?? "").trim();
      if (text === needle || text.includes(needle)) {
        const r = n.getBoundingClientRect();
        return {
          id: n.dataset?.nodeId ?? "",
          center: { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 },
        };
      }
    }
    return null;
  }, targetText);
  return result;
}
