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
    expect(result?.rootJson).toEqual(
      makeMJfromLatex(String.raw`m \ddot{\vec{r}} = \vec{F}_{g} + \vec{N}`)
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
});
