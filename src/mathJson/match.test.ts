import { describe, expect, it } from "vitest";
import { makeMJfromLatex } from "../testHelpers";
import {
  canonicalizeForMatch,
  deepEqualMJ,
  lhsMatchesSelected,
} from "./match";

describe("match helpers", () => {
  it("unwraps delimiters for matching", () => {
    const lhs = makeMJfromLatex("(N)");
    const sel = makeMJfromLatex("N");
    expect(lhsMatchesSelected(lhs, sel)).toBe(true);
  });

  it("collapses double negation", () => {
    const lhs = makeMJfromLatex("-(-N)");
    const sel = makeMJfromLatex("N");
    expect(lhsMatchesSelected(lhs, sel)).toBe(true);
  });

  it("drops multiplicative identity", () => {
    const lhs = makeMJfromLatex("1 N");
    const sel = makeMJfromLatex("N");
    expect(lhsMatchesSelected(lhs, sel)).toBe(true);
  });

  it("drops additive identity", () => {
    const lhs = makeMJfromLatex("N + 0");
    const sel = makeMJfromLatex("N");
    expect(lhsMatchesSelected(lhs, sel)).toBe(true);
  });

  it("canonicalizes nested wrappers consistently", () => {
    const canon = canonicalizeForMatch(makeMJfromLatex("(N + 0)"));
    const expected = canonicalizeForMatch(makeMJfromLatex("N"));
    expect(deepEqualMJ(canon, expected)).toBe(true);
  });

  it("does not match different symbols", () => {
    const lhs = makeMJfromLatex("M");
    const sel = makeMJfromLatex("N");
    expect(lhsMatchesSelected(lhs, sel)).toBe(false);
  });
});
