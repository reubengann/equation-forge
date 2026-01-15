import { type Page } from "@playwright/test";
import { ExpressionTree } from "../../src/ExpressionTree";
import { ce } from "../../src/computeEngine";

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

function buildTree(latex: string): ExpressionTree {
  const expr = ce.parse(latex, { canonical: false });
  if (!expr) throw new Error(`Failed to parse LaTeX: ${latex}`);
  const json = expr.json;
  return ExpressionTree.create(json as any);
}

function findNodeIdByLatex(tree: ExpressionTree, match: LatexMatch): string {
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

async function waitForMathRender(page: Page, nodeIds: string[] = []) {
  await page.waitForSelector('[data-testid="math-display"]');
  await page.waitForFunction(
    ({ nodeIds }) => {
      const host = document.querySelector(
        '[data-testid="math-display"]'
      ) as HTMLElement | null;
      if (!host) return false;
      const sr = host.shadowRoot ?? (host as any).shadowRoot;
      if (!sr) return false;
      if (!sr.querySelector("[data-node-id]")) return false;

      const rectFor = (id: string) => {
        const els = sr.querySelectorAll<HTMLElement>(
          `[data-node-id="${CSS.escape(id)}"]`
        );
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
    { nodeIds }
  );
}

async function getNodeRects(
  page: Page,
  nodeIds: string[]
): Promise<Record<string, { rect: Rect; center: Point }>> {
  const handle = await page.waitForFunction(
    ({ nodeIds }) => {
      const host = document.querySelector(
        '[data-testid="math-display"]'
      ) as HTMLElement | null;
      if (!host) return null;
      const sr = host.shadowRoot ?? (host as any).shadowRoot;
      if (!sr) return null;

      const rectFor = (id: string) => {
        const els = sr.querySelectorAll<HTMLElement>(
          `[data-node-id="${CSS.escape(id)}"]`
        );
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
    { nodeIds }
  );

  const rects = await handle?.jsonValue();
  if (!rects) {
    throw new Error(`Could not resolve rects for ids: ${nodeIds.join(", ")}`);
  }
  return rects as Record<string, { rect: Rect; center: Point }>;
}

export async function setEquation(page: Page, latex: string) {
  await page.goto("/");
  await page.getByTestId("latex-input").evaluate((el, value) => {
    (el as any).value = value;
  }, latex);
  await page.getByTestId("add-update").click();
  await waitForMathRender(page);
}

export async function setMoveMode(page: Page, mode: "additive" | "multiplicative") {
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

  if (params.preClick !== false) {
    await page.mouse.click(start.x, start.y, {
      clickCount: params.clickCount ?? 1,
    });
  } else {
    await page.mouse.move(start.x, start.y);
  }
  await page.mouse.down();
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
  if (tagName?.toLowerCase() === "input" || tagName?.toLowerCase() === "textarea") {
    return (await locator.inputValue()).trim();
  }

  return (await locator.innerText()).trim();
}
