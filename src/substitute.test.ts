import { describe, expect, it } from "vitest";
import { substitute } from "./substitute";
import { makeMJfromLatex, treefromLatex } from "./testHelpers";

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
});
