import { describe, expect, it } from "vitest";
import { findNodeId, treefromLatex } from "../../testHelpers";
import { canForceDelimiter, forceDelimiter } from "./forceDelimiter";

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

describe("forceDelimiter", () => {
  it("wraps selected non-delimited node in parentheses (force)", () => {
    const tree = treefromLatex(String.raw`a = b c + e`);
    const bcId = findNodeId(tree, (n) => n.op === "InvisibleOperator" && n.latex === "b c");
    const result = forceDelimiter(tree, {
      kind: "node",
      nodeId: bcId,
    });

    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(String.raw`a = \left(b c\right) + e`);
  });

  it("removes selected parentheses delimiter (unforce)", () => {
    const tree = treefromLatex(String.raw`a + \left(b + c\right)`);
    const delimiterId = findNodeId(tree, (n) => n.op === "Delimiter");
    const result = forceDelimiter(tree, {
      kind: "node",
      nodeId: delimiterId,
    });

    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(String.raw`a + b + c`);
  });

  it("removes selected square-bracket list delimiter (unforce)", () => {
    const tree = treefromLatex(String.raw`a + \left[b + c\right]`);
    const listId = findNodeId(tree, (n) => n.op === "List");
    const result = forceDelimiter(tree, {
      kind: "node",
      nodeId: listId,
    });

    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(String.raw`a + b + c`);
  });

  it("reports capability for any node selection", () => {
    const tree = treefromLatex(String.raw`a + \left(b + c\right)`);
    const addId = tree.rootId;
    expect(canForceDelimiter(tree, { kind: "node", nodeId: addId })).toBe(true);
    expect(canForceDelimiter(tree, null)).toBe(false);
  });

  it("enables for contiguous multi-selection and wraps that subexpression", () => {
    const tree = treefromLatex(String.raw`a = b c e + \left[g h + i\right] f`);
    const bId = findNodeId(tree, (n) => n.latex === "b");
    const cId = findNodeId(tree, (n) => n.latex === "c");
    const sel = { kind: "multi", nodeIds: [bId, cId] } as const;

    expect(canForceDelimiter(tree, sel)).toBe(true);
    const result = forceDelimiter(tree, sel);
    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`a = \left(b c\right) e + \left[g h + i\right] f`
    );
  });

  it("unforcing [-v] under an outer negate normalizes --v to v (issue 39)", () => {
    const tree = treefromLatex(
      String.raw`c_{P} - c_{v} = -\left[-v\right] \left(\frac{\partial{P}}{\partial{T}}\right)_{v}`
    );
    const listId = findNodeId(tree, (n) => n.op === "List" && n.latex.includes("-v"));
    const result = forceDelimiter(tree, {
      kind: "node",
      nodeId: listId,
    });

    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`c_{P} - c_{v} = v \left(\frac{\partial{P}}{\partial{T}}\right)_{v}`
    );
  });

  it("unforcing grouped negative additive term restores subtraction form (issue 127)", () => {
    const tree = treefromLatex(
      String.raw`s = \int_{T_{0}}^{T} \frac{c_{P}}{T} \,\mathrm{d}{T} - \left(R \ln\left(\frac{\left|P\right|}{\left|P_{0}\right|}\right)\right) + s_{0}`
    );
    const innerGroupId = findNodeId(
      tree,
      (n) => n.op === "Delimiter" && n.latex.includes(String.raw`R \ln`)
    );
    const result = forceDelimiter(tree, {
      kind: "node",
      nodeId: innerGroupId,
    });

    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`s = \int_{T_{0}}^{T} \frac{c_{P}}{T} \,\mathrm{d}{T} - R \ln\left(\frac{\left|P\right|}{\left|P_{0}\right|}\right) + s_{0}`
    );
  });

  it("unforcing when selection resolves to negated grouped term removes extra parentheses (issue 127)", () => {
    const tree = treefromLatex(
      String.raw`s = \int_{T_{0}}^{T} \frac{c_{P}}{T} \,\mathrm{d}{T} - \left(R \ln\left(\frac{\left|P\right|}{\left|P_{0}\right|}\right)\right) + s_{0}`
    );
    const negatedTermId = findNodeId(
      tree,
      (n) => n.op === "Negate" && n.latex.includes(String.raw`R \ln`)
    );
    const result = forceDelimiter(tree, {
      kind: "node",
      nodeId: negatedTermId,
    });

    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`s = \int_{T_{0}}^{T} \frac{c_{P}}{T} \,\mathrm{d}{T} - R \ln\left(\frac{\left|P\right|}{\left|P_{0}\right|}\right) + s_{0}`
    );
    expect(normalizeSpaces(result!.latexPlain)).not.toContain(
      String.raw`\left(\left(R \ln`
    );
  });

  it("unforcing absolute value under ln removes abs wrapper (issue 142)", () => {
    const tree = treefromLatex(
      String.raw`\int g \left(\theta\right) \,\mathrm{d}{\theta} = \ln\left(\left|\theta\right|\right)`
    );
    const absId = findNodeId(tree, (n) => n.op === "Abs" && n.latex.includes(String.raw`\theta`));
    const result = forceDelimiter(tree, {
      kind: "node",
      nodeId: absId,
    });

    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\int g \left(\theta\right) \,\mathrm{d}{\theta} = \ln\left(\theta\right)`
    );
  });

  it("unforcing negated grouped additive term distributes sign (issue 153)", () => {
    const tree = treefromLatex(
      String.raw`\frac{\partial^{2}{h}}{\partial{T} \partial{v}} - v \frac{\partial^{2}{P}}{\partial{T} \partial{v}} - \frac{1}{T} \left(\frac{\partial{h}}{\partial{v}}\right)_{T} + \frac{1}{T} v \left(\frac{\partial{P}}{\partial{v}}\right)_{T} = \frac{\partial^{2}{h}}{\partial{v} \partial{T}} - \left(\left(\frac{\partial{P}}{\partial{T}}\right)_{v} + v \frac{\partial^{2}{P}}{\partial{v} \partial{T}}\right)`
    );
    const negatedGroupId = findNodeId(
      tree,
      (n) =>
        n.op === "Negate" &&
        n.latex.includes(String.raw`\left(\left(\frac{\partial{P}}{\partial{T}}\right)_{v}`) &&
        n.latex.includes(String.raw`v \frac{\partial^{2}{P}}{\partial{v} \partial{T}}`)
    );
    const result = forceDelimiter(tree, {
      kind: "node",
      nodeId: negatedGroupId,
    });

    expect(result).not.toBeNull();
    expect(normalizeSpaces(result!.latexPlain)).toBe(
      String.raw`\frac{\partial^{2}{h}}{\partial{T} \partial{v}} - v \frac{\partial^{2}{P}}{\partial{T} \partial{v}} - \frac{1}{T} \left(\frac{\partial{h}}{\partial{v}}\right)_{T} + \frac{1}{T} v \left(\frac{\partial{P}}{\partial{v}}\right)_{T} = \frac{\partial^{2}{h}}{\partial{v} \partial{T}} - \left(\frac{\partial{P}}{\partial{T}}\right)_{v} - v \frac{\partial^{2}{P}}{\partial{v} \partial{T}}`
    );
  });
});

