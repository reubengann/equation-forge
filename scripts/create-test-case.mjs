import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith("--")) continue;
    const eqIndex = raw.indexOf("=");
    if (eqIndex > 2) {
      const key = raw.slice(2, eqIndex);
      out[key] = raw.slice(eqIndex + 1);
      continue;
    }
    const key = raw.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function requiredArg(args, key) {
  const value = args[key];
  if (!value || typeof value !== "string") {
    throw new Error(`Missing required argument --${key}`);
  }
  return value;
}

function asNumber(value, fallback) {
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function waitForMathRender(page) {
  await page.waitForSelector('[data-testid="math-display"]');
  await page.waitForFunction(() => {
    const host = document.querySelector(
      '[data-testid="math-display"]'
    );
    const sr = host?.shadowRoot ?? host?.["shadowRoot"];
    if (!sr) return false;
    return !!sr.querySelector("[data-node-id]");
  });
}

async function setEquation(page, baseUrl, latex) {
  await page.goto(baseUrl);
  await page.waitForSelector('[data-testid="latex-input"]');
  const textMode = page.locator('input[name="entry-mode"][value="text"]');
  if (await textMode.count()) {
    await textMode.click();
  }
  await page.getByTestId("latex-input").fill(latex);
  await page.getByTestId("add-update").click();
  await waitForMathRender(page);
}

async function setMode(page, mode) {
  await page.getByTestId(`mode-${mode}`).click();
  await waitForMathRender(page);
}

async function readDebugState(page) {
  return page.evaluate(() => {
    return (window).__dpDebug ?? null;
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const expression = requiredArg(args, "expression");
  const fromLatex = requiredArg(args, "from");
  const toLatex = requiredArg(args, "to");
  const mode = args.mode === "multiplicative" ? "multiplicative" : "additive";
  const steps = Math.max(3, Math.floor(asNumber(args.steps, 16)));
  const biasX = asNumber(args.toBiasX, 0);
  const biasY = asNumber(args.toBiasY, 0);
  const fixtureName = args.name || `capture-${slugify(fromLatex)}-to-${slugify(toLatex)}`;
  const outputPath = args.output
    ? path.resolve(args.output)
    : path.resolve("mathtests", "captured", `${fixtureName}.json`);
  const port = Math.floor(asNumber(args.port, 4173));

  const server = await createServer({
    logLevel: "error",
    server: { host: "127.0.0.1", port, strictPort: true },
  });
  await server.listen();

  const browser = await chromium.launch({
    headless: !(args.headed === "true"),
  });

  try {
    const page = await browser.newPage();
    await setEquation(page, `http://127.0.0.1:${port}`, expression);
    await setMode(page, mode);

    const stateReady = await readDebugState(page);
    if (!stateReady) {
      throw new Error(
        "Debug bridge is unavailable. Ensure the app is on the Debug page."
      );
    }

    const ids = await page.evaluate(
      ({ fromLatexArg, toLatexArg }) => {
        const api = (window).__dpDebug;
        if (!api) return null;
        const fromId = api.getNodeIdByLatex(fromLatexArg);
        const toId = api.getNodeIdByLatex(toLatexArg);
        if (!fromId || !toId) return null;
        return { fromId, toId };
      },
      { fromLatexArg: fromLatex, toLatexArg: toLatex }
    );
    if (!ids) {
      throw new Error(
        `Could not resolve node ids for --from='${fromLatex}' and --to='${toLatex}'.`
      );
    }

    const points = await page.evaluate(
      ({ fromId, toId, biasXArg, biasYArg }) => {
        const api = (window).__dpDebug;
        if (!api) return null;
        const fromRect = api.getNodeRectById(fromId);
        const toRect = api.getNodeRectById(toId);
        if (!fromRect || !toRect) return null;
        const fromCenter = {
          x: (fromRect.left + fromRect.right) / 2,
          y: (fromRect.top + fromRect.bottom) / 2,
        };
        const toCenter = {
          x: (toRect.left + toRect.right) / 2 + biasXArg,
          y: (toRect.top + toRect.bottom) / 2 + biasYArg,
        };
        return { fromCenter, toCenter };
      },
      { ...ids, biasXArg: biasX, biasYArg: biasY }
    );
    if (!points) {
      throw new Error("Could not compute drag points from runtime node rects.");
    }

    await page.evaluate(() => {
      const api = (window).__dpDebug;
      api?.clearMoveCapture?.();
    });

    await page.mouse.move(points.fromCenter.x, points.fromCenter.y);
    await page.mouse.down();
    await page.mouse.move(points.toCenter.x, points.toCenter.y, { steps });
    await page.mouse.up();

    const capture = await page.evaluate(() => {
      const api = (window).__dpDebug;
      return api?.getMoveCapture?.() ?? null;
    });
    if (!capture) {
      throw new Error("No move capture produced. Drag may not have started.");
    }

    const fixture = {
      ...capture,
      name: fixtureName,
    };

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

    process.stdout.write(`Saved fixture: ${outputPath}\n`);
    process.stdout.write(
      `Summary: mode=${fixture.mode} selected=${fixture.selectedIds.length} rects=${Object.keys(
        fixture.rects ?? {}
      ).length} samples=${fixture.samples?.length ?? 0}\n`
    );
  } finally {
    await browser.close();
    await server.close();
  }
}

run().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`create_test_case failed: ${message}\n`);
  process.exitCode = 1;
});

