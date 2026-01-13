import { describe, expect, it, beforeAll } from "vitest";
import { treefromLatex } from "./testHelpers";
import {
  getSlotForMoveContainer,
  getMoveContainerForHover,
  remapEqualHoverToSide,
  getChildRectsInShadow,
  getSlotForAddReorder,
  hitTestNodeIdInMathliveShadow,
} from "./mathliveShadow";

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
    // selector can be `[data-node-id="id"]` or `[data-node-id]`
    const m = selector.match(/data-node-id="([^"]+)"/);
    if (m) {
      const id = m[1];
      return this.elements.filter((el) => el.dataset.nodeId === id);
    }
    if (selector === "[data-node-id]") return this.elements;
    return [];
  }
}

function stubMathDiv(elements: StubEl[]) {
  return { shadowRoot: new StubShadowRoot(elements) } as any;
}

beforeAll(() => {
  if (!(globalThis as any).CSS) {
    (globalThis as any).CSS = {};
  }
  if (!(globalThis as any).CSS.escape) {
    (globalThis as any).CSS.escape = (s: string) => s.replace(/"/g, '\\"');
  }
});

describe("mathliveShadow helpers", () => {
  it("remapEqualHoverToSide picks the nearer side", () => {
    const tree = treefromLatex("a=b");
    const equalId = tree.rootId;
    const [lhsId, rhsId] = tree.childrenById[equalId];

    const elements = [
      new StubEl(lhsId, { left: 0, right: 10, top: 0, bottom: 10 }),
      new StubEl(rhsId, { left: 20, right: 30, top: 0, bottom: 10 }),
    ];
    const mathDiv = stubMathDiv(elements);

    expect(remapEqualHoverToSide(tree, mathDiv, equalId, 5)).toBe(lhsId);
    expect(remapEqualHoverToSide(tree, mathDiv, equalId, 25)).toBe(rhsId);
  });

  it("getMoveContainerForHover climbs to nearest Add", () => {
    const tree = treefromLatex("a + b");
    const addId = tree.rootId;
    const [aId] = tree.childrenById[addId];

    expect(getMoveContainerForHover(tree, aId)).toBe(addId);
    expect(getMoveContainerForHover(tree, addId)).toBe(addId);
  });

  it("getSlotForMoveContainer returns slots for Add children", () => {
    const tree = treefromLatex("a + b");
    const addId = tree.rootId;
    const [aId, bId] = tree.childrenById[addId];

    const elements = [
      new StubEl(aId, { left: 0, right: 10, top: 0, bottom: 10 }),
      new StubEl(bId, { left: 20, right: 30, top: 0, bottom: 10 }),
    ];
    const mathDiv = stubMathDiv(elements);

    expect(getSlotForMoveContainer(tree, mathDiv, addId, -5)).toBeNull();
    expect(getSlotForMoveContainer(tree, mathDiv, addId, 1)).toBe(0);
    expect(getSlotForMoveContainer(tree, mathDiv, addId, 15)).toBe(1);
    expect(getSlotForMoveContainer(tree, mathDiv, addId, 40)).toBe(2);
  });

  it("getChildRectsInShadow returns [] when no shadowRoot", () => {
    const els: StubEl[] = [];
    const mathDiv = { shadowRoot: null } as any;
    expect(getChildRectsInShadow(mathDiv, ["n1"])).toEqual([]);
  });

  it("getSlotForAddReorder returns null when not enough children or no rects", () => {
    const tree = treefromLatex("a");
    const addId = tree.rootId!;
    const mathDiv = stubMathDiv([]);
    expect(getSlotForAddReorder(tree, mathDiv, addId, 10)).toBeNull();
  });

  it("hitTestNodeIdInMathliveShadow picks smallest containing area", () => {
    const el1 = new StubEl("n1", { left: 0, right: 50, top: 0, bottom: 50 });
    const el2 = new StubEl("n2", { left: 10, right: 20, top: 10, bottom: 20 });
    const mathDiv = { shadowRoot: new StubShadowRoot([el1, el2]) } as any;

    expect(hitTestNodeIdInMathliveShadow(mathDiv, 15, 15)).toBe("n2");
  });

  it("getSlotForMoveContainer on singleton uses pickInsertSlot and returns null when no rects", () => {
    const tree = treefromLatex("a");
    const addId = tree.rootId!;
    const mathDiv = stubMathDiv([]); // no rects
    expect(getSlotForMoveContainer(tree, mathDiv, addId, 5)).toBeNull();
  });
});
