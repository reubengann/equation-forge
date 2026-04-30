import { describe, expect, it } from "vitest";
import {
  add,
  buildCompiledExprIndex,
  num,
  partialAtConstQuantity,
  power,
  sym,
} from ".";

describe("buildCompiledExprIndex", () => {
  it("builds id, parent, and ancestor lookups in preorder", () => {
    const expr = add([sym("a"), power(sym("b"), num(2))]);
    const index = buildCompiledExprIndex(expr);

    expect(index.rootId).toBe("n1");
    expect(index.nodeById.n1.kind).toBe("add");
    expect(index.nodeById.n2.kind).toBe("symbol");
    expect(index.nodeById.n3.kind).toBe("power");
    expect(index.nodeById.n4.kind).toBe("symbol");
    expect(index.nodeById.n5.kind).toBe("number");

    expect(index.parentById).toEqual({
      n1: null,
      n2: "n1",
      n3: "n1",
      n4: "n3",
      n5: "n3",
    });

    expect(index.ancestorsById.n1).toEqual([]);
    expect(index.ancestorsById.n2).toEqual(["n1"]);
    expect(index.ancestorsById.n4).toEqual(["n1", "n3"]);
  });

  it("tracks child order for partial_at_const_quantity", () => {
    const expr = partialAtConstQuantity(sym("T"), sym("V"), sym("P"));
    const index = buildCompiledExprIndex(expr);

    expect(index.nodeById.n1.kind).toBe("partial_at_const_quantity");
    expect(index.nodeById.n2).toMatchObject({ kind: "symbol", name: "T" });
    expect(index.nodeById.n3).toMatchObject({ kind: "symbol", name: "V" });
    expect(index.nodeById.n4).toMatchObject({ kind: "symbol", name: "P" });
    expect(index.parentById.n4).toBe("n1");
    expect(index.ancestorsById.n4).toEqual(["n1"]);
  });
});
