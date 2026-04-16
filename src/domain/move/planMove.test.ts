import { describe, expect, it } from "vitest";
import { treefromLatex } from "../../testHelpers";
import { planMove } from "./planMove";

describe("planMove additive sibling hover", () => {
  it("plans reorder when dragging onto duplicate sibling term right edge (issue 100)", () => {
    const tree = treefromLatex(
      String.raw`\Delta S = c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) - c_{P} m \ln\left(T_{1}\right) + c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) - c_{P} m \ln\left(T_{2}\right)`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    const rhsKids = rhsId ? tree.childrenById[rhsId] ?? [] : [];
    expect(rhsKids.length).toBeGreaterThanOrEqual(4);

    const movedId = rhsKids[0];
    const hoverId = rhsKids[2];

    const rectMap = new Map<string, { left: number; top: number; right: number; bottom: number }>();
    rectMap.set(rhsId!, { left: 0, top: 0, right: 400, bottom: 40 });
    rectMap.set(rhsKids[0], { left: 0, top: 0, right: 80, bottom: 40 });
    rectMap.set(rhsKids[1], { left: 90, top: 0, right: 170, bottom: 40 });
    rectMap.set(rhsKids[2], { left: 180, top: 0, right: 260, bottom: 40 });
    rectMap.set(rhsKids[3], { left: 270, top: 0, right: 350, bottom: 40 });

    const plan = planMove({
      tree,
      selectedIds: [movedId],
      hoverId,
      pointer: { x: 250, y: 20 }, // right half of the 3rd term
      rectFor: (id) => rectMap.get(id) ?? null,
      mode: "additive",
    });

    expect(plan).not.toBeNull();
    expect(plan?.kind).toBe("ReorderAdd");
    if (!plan || plan.kind !== "ReorderAdd") return;
    expect(plan.toIndex).toBe(2);
  });

  it("plans reorder when hover is inside sibling term descendant (issue 100 app parity)", () => {
    const tree = treefromLatex(
      String.raw`\Delta S = c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) - c_{P} m \ln\left(T_{1}\right) + c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) - c_{P} m \ln\left(T_{2}\right)`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    const rhsKids = rhsId ? tree.childrenById[rhsId] ?? [] : [];
    expect(rhsKids.length).toBeGreaterThanOrEqual(4);

    const movedId = rhsKids[0];
    const hoveredTermId = rhsKids[2];
    const hoveredLnDescendant = hoveredTermId
      ? (tree.childrenById[hoveredTermId] ?? []).find(
          (id) => tree.nodesById[id]?.op === "Ln"
        )
      : null;
    expect(hoveredLnDescendant).toBeTruthy();

    const rectMap = new Map<string, { left: number; top: number; right: number; bottom: number }>();
    rectMap.set(rhsId!, { left: 0, top: 0, right: 400, bottom: 40 });
    rectMap.set(rhsKids[0], { left: 0, top: 0, right: 80, bottom: 40 });
    rectMap.set(rhsKids[1], { left: 90, top: 0, right: 170, bottom: 40 });
    rectMap.set(rhsKids[2], { left: 180, top: 0, right: 260, bottom: 40 });
    rectMap.set(rhsKids[3], { left: 270, top: 0, right: 350, bottom: 40 });
    rectMap.set(hoveredLnDescendant!, { left: 200, top: 6, right: 252, bottom: 34 });

    const plan = planMove({
      tree,
      selectedIds: [movedId],
      hoverId: hoveredLnDescendant!,
      pointer: { x: 248, y: 20 }, // right side within descendant ln
      rectFor: (id) => rectMap.get(id) ?? null,
      mode: "additive",
    });

    expect(plan).not.toBeNull();
    expect(plan?.kind).toBe("ReorderAdd");
    if (!plan || plan.kind !== "ReorderAdd") return;
    expect(plan.toIndex).toBe(2);
  });

  it("promotes multiplicative span ids and plans additive reorder on descendant hover (app debug parity)", () => {
    const tree = treefromLatex(
      String.raw`\Delta S = c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) - c_{P} m \ln\left(T_{1}\right) + c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) - c_{P} m \ln\left(T_{2}\right)`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    const rhsKids = rhsId ? tree.childrenById[rhsId] ?? [] : [];
    const firstTermId = rhsKids[0];
    const duplicateTermId = rhsKids[2];
    expect(firstTermId).toBeTruthy();
    expect(duplicateTermId).toBeTruthy();

    const firstFactors = firstTermId ? tree.childrenById[firstTermId] ?? [] : [];
    expect(firstFactors.length).toBeGreaterThanOrEqual(3);
    const selectedIds = [firstFactors[0], firstFactors[1], firstFactors[2]];

    const hoveredLnDescendant = duplicateTermId
      ? (tree.childrenById[duplicateTermId] ?? []).find(
          (id) => tree.nodesById[id]?.op === "Ln"
        )
      : null;
    expect(hoveredLnDescendant).toBeTruthy();

    const rectMap = new Map<string, { left: number; top: number; right: number; bottom: number }>();
    rectMap.set(rhsId!, { left: 0, top: 0, right: 400, bottom: 40 });
    rectMap.set(rhsKids[0], { left: 0, top: 0, right: 80, bottom: 40 });
    rectMap.set(rhsKids[1], { left: 90, top: 0, right: 170, bottom: 40 });
    rectMap.set(rhsKids[2], { left: 180, top: 0, right: 260, bottom: 40 });
    rectMap.set(rhsKids[3], { left: 270, top: 0, right: 350, bottom: 40 });
    rectMap.set(hoveredLnDescendant!, { left: 200, top: 6, right: 252, bottom: 34 });

    const plan = planMove({
      tree,
      selectedIds,
      hoverId: hoveredLnDescendant!,
      pointer: { x: 248, y: 20 },
      rectFor: (id) => rectMap.get(id) ?? null,
      mode: "additive",
    });

    expect(plan).not.toBeNull();
    expect(plan?.kind).toBe("ReorderAdd");
    if (!plan || plan.kind !== "ReorderAdd") return;
    expect(plan.toIndex).toBe(2);
  });
});

describe("planMove multiplicative delimiter-hover reorder", () => {
  it("plans reorder (not merge) when hovering delimiter that wraps Add (issue 103)", () => {
    const tree = treefromLatex(
      String.raw`\mathrm{d}{s} = \frac{1}{T} \left(\frac{\partial{u}}{\partial{T}}\right)_{v} \mathrm{d}{T} + \frac{1}{T} \mathrm{d}{v} \left(\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right)`
    );
    const rhsId = tree.childrenById[tree.rootId]?.[1];
    expect(rhsId).toBeTruthy();
    const rhsKids = rhsId ? tree.childrenById[rhsId] ?? [] : [];
    const secondTermId = rhsKids[1];
    expect(secondTermId).toBeTruthy();
    const termKids = secondTermId ? tree.childrenById[secondTermId] ?? [] : [];
    expect(termKids.length).toBeGreaterThanOrEqual(3);
    const movedDvId = termKids[1];
    const delimiterId = termKids[2];
    const delimiterInnerId = delimiterId ? (tree.childrenById[delimiterId] ?? [])[0] : null;
    expect(delimiterInnerId).toBeTruthy();

    const rectMap = new Map<string, { left: number; top: number; right: number; bottom: number }>();
    rectMap.set(secondTermId!, { left: 100, top: 0, right: 500, bottom: 40 });
    rectMap.set(termKids[0], { left: 100, top: 0, right: 170, bottom: 40 });
    rectMap.set(termKids[1], { left: 180, top: 0, right: 240, bottom: 40 });
    rectMap.set(termKids[2], { left: 250, top: 0, right: 460, bottom: 40 });
    rectMap.set(delimiterId!, { left: 250, top: 0, right: 460, bottom: 40 });
    rectMap.set(delimiterInnerId!, { left: 270, top: 6, right: 445, bottom: 34 });

    const plan = planMove({
      tree,
      selectedIds: [movedDvId],
      hoverId: delimiterInnerId!,
      pointer: { x: 459, y: 20 },
      rectFor: (id) => rectMap.get(id) ?? null,
      mode: "multiplicative",
    });

    expect(plan).not.toBeNull();
    expect(plan?.kind).toBe("ReorderAdd");
    if (!plan || plan.kind !== "ReorderAdd") return;
    expect(plan.addId).toBe(secondTermId);
    expect(plan.toIndex).toBe(2);
  });
});

