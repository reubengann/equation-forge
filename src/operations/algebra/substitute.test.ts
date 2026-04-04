import { describe, expect, it } from "vitest";
import { substitute, substituteMany, substituteSpan } from "./substitute";
import { findNodeByLatex, makeMJfromLatex, treefromLatex } from "../../testHelpers";

describe("substitute", () => {
  it("replaces a single occurrence", () => {
    const tree = treefromLatex("a + a = b");
    const targetId = tree.idByPath["1.1"]; // left-hand a
    const replacement = makeMJfromLatex("c");

    const result = substitute({
      tree,
      targetId,
      replacement,
      scope: "single",
    });

    expect(result).not.toBeNull();
    expect(result?.latexPlain).toBe("c + a = b");
  });

  it("replaces all structurally matching occurrences", () => {
    const tree = treefromLatex("a + a = b");
    const targetId = tree.idByPath["1.1"];
    const replacement = makeMJfromLatex("c");

    const result = substitute({
      tree,
      targetId,
      replacement,
      scope: "all",
    });

    expect(result).not.toBeNull();
    expect(result?.latexPlain).toBe("c + c = b");
  });

  it("handles physics vector substitution", () => {
    const tree = treefromLatex(String.raw`\vec{F} = \vec{F}_{g} + \vec{N}`);
    const targetId = tree.idByPath["1"]; // left-hand \vec{F}
    const replacement = makeMJfromLatex(String.raw`m \ddot{\vec{r}}`);

    const result = substitute({
      tree,
      targetId,
      replacement,
      scope: "single",
    });

    expect(result).not.toBeNull();
    expect(result?.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`m, \ddot{\vec{r}} = \vec{F}_{g} + \vec{N}`
    );
  });

  it("wraps additive replacement when substituting into a product", () => {
    const tree = treefromLatex(String.raw`2 x_{2} - x_{1}`);
    const targetId = findNodeByLatex(tree, String.raw`x_{2}`);
    const replacement = makeMJfromLatex(String.raw`a+b`);

    const result = substitute({
      tree,
      targetId,
      replacement,
      scope: "single",
    });

    expect(result).not.toBeNull();
    expect(result?.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`2 \left(a + b\right) - x_{1}`
    );
  });

  it("replaces all explicitly selected nodes for multi selection", () => {
    const tree = treefromLatex(String.raw`\left(a - c + b\right) - \left(d\right) = e`);
    const aId = findNodeByLatex(tree, String.raw`a`);
    const cId = findNodeByLatex(tree, String.raw`c`);
    const replacement = makeMJfromLatex(String.raw`z`);

    const result = substituteMany({
      tree,
      targetIds: [aId, cId],
      replacement,
      scope: "single",
    });

    expect(result).not.toBeNull();
    expect(result?.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\left(z - z + b\right) - \left(d\right) = e`
    );
  });

  it("replaces a span as a single expression", () => {
    const tree = treefromLatex(String.raw`\left(a - c + b\right) - \left(d\right) = e`);
    const addId = findNodeByLatex(tree, String.raw`a - c + b`);
    const replacement = makeMJfromLatex(String.raw`z`);

    const result = substituteSpan({
      tree,
      parentId: addId,
      start: 0,
      end: 1,
      replacement,
    });

    expect(result).not.toBeNull();
    expect(result?.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`\left(z + b\right) - \left(d\right) = e`
    );
  });

  it("maps EulerGamma replacement symbol to gamma for substitution (issue 40)", () => {
    const tree = treefromLatex(String.raw`a = b c`);
    const targetId = findNodeByLatex(tree, String.raw`b`);
    const replacement = makeMJfromLatex(String.raw`\gamma`);

    const result = substitute({
      tree,
      targetId,
      replacement,
      scope: "single",
    });

    expect(result).not.toBeNull();
    expect(result?.latexPlain.replace(/\s+/g, " ").trim()).toBe(String.raw`a = \gamma c`);
  });

  it("wraps negative replacement in product context to preserve multiplication (issue 41)", () => {
    const tree = treefromLatex(
      String.raw`\frac{\mathrm{d}{P_{s}}}{\mathrm{d}{v_{s}}} = \gamma \left(\frac{\partial{P}}{\partial{v}}\right)_{T}`
    );
    const targetId = findNodeByLatex(
      tree,
      String.raw`\left(\frac{\partial{P}}{\partial{v}}\right)_{T}`
    );
    const replacement = makeMJfromLatex(String.raw`-\frac{P}{v}`);

    const result = substitute({
      tree,
      targetId,
      replacement,
      scope: "single",
    });

    expect(result).not.toBeNull();
    const normalized = result!.latexPlain.replace(/\s+/g, " ").trim();
    expect(normalized).toContain(String.raw`\left(-\frac{P}{v}\right)`);
    expect(normalized).not.toContain(String.raw`\mathrm{EulerGamma} -\frac{P}{v}`);
    expect(normalized).not.toContain(String.raw`\gamma -\frac{P}{v}`);
  });

  it("wraps fraction replacement when substituted into power base (issue 46)", () => {
    const tree = treefromLatex(String.raw`P v^{\gamma} = K`);
    const targetId = findNodeByLatex(tree, String.raw`v`);
    const replacement = makeMJfromLatex(String.raw`\frac{R T}{P}`);

    const result = substitute({
      tree,
      targetId,
      replacement,
      scope: "single",
    });

    expect(result).not.toBeNull();
    expect(result!.latexPlain.replace(/\s+/g, " ").trim()).toBe(
      String.raw`P \left(\frac{R T}{P}\right)^{\gamma} = K`
    );
  });
});
