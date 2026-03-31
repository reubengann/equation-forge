import { describe, expect, it, beforeAll } from "vitest";
import {
  snapshotRectsForTree,
  snapshotSelectableRectsForTree,
} from "./rectProvider";

type Rect = { left: number; right: number; top: number; bottom: number };

class StubEl {
  dataset: { nodeId: string };
  private rect: Rect;
  constructor(id: string, rect: Rect) {
    this.dataset = { nodeId: id };
    this.rect = rect;
  }
  getBoundingClientRect() {
    return this.rect;
  }
}

class StubShadowRoot {
  private elements: StubEl[];
  constructor(elements: StubEl[]) {
    this.elements = elements;
  }
  querySelectorAll(selector: string): StubEl[] {
    const m = selector.match(/data-node-id="([^"]+)"/);
    if (m) {
      const id = m[1];
      return this.elements.filter((el) => el.dataset.nodeId === id);
    }
    return [];
  }
}

beforeAll(() => {
  if (!(globalThis as any).CSS) (globalThis as any).CSS = {};
  if (!(globalThis as any).CSS.escape) {
    (globalThis as any).CSS.escape = (s: string) => s.replace(/"/g, '\\"');
  }
});

describe("rectProvider snapshots", () => {
  it("collects all node rects and filters selectable ones", () => {
    const tree = {
      nodesById: {
        nSymbol: { op: "Symbol" },
        nAdd: { op: "Add" },
        nEqual: { op: "Equal" },
        nMultiply: { op: "Multiply" },
      },
    } as any;

    const measureEl = {
      shadowRoot: new StubShadowRoot([
        new StubEl("nSymbol", { left: 1, right: 2, top: 3, bottom: 4 }),
        new StubEl("nAdd", { left: 5, right: 6, top: 7, bottom: 8 }),
        new StubEl("nEqual", { left: 9, right: 10, top: 11, bottom: 12 }),
        new StubEl("nMultiply", { left: 13, right: 15, top: 17, bottom: 19 }),
      ]),
    } as any;

    const all = snapshotRectsForTree(measureEl, tree);
    expect(Object.keys(all).sort()).toEqual([
      "nAdd",
      "nEqual",
      "nMultiply",
      "nSymbol",
    ]);

    const selectable = snapshotSelectableRectsForTree(measureEl, tree);
    expect(Object.keys(selectable).sort()).toEqual(["nMultiply", "nSymbol"]);
  });
});
