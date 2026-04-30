import { describe, expect, it } from "vitest";
import { compileMathDocument, resolveCompiledNodeId } from "./compileMathDocument";

describe("compileMathDocument", () => {
  it("builds one compiled object with latex and index data", () => {
    const compiled = compileMathDocument(String.raw`a+b=c`);
    expect(compiled.expr.kind).toBe("equation");
    expect(compiled.plainLatex).toBe(String.raw`a + b = c`);
    expect(compiled.taggedLatex).toContain(String.raw`node-id="n1"`);
    expect(compiled.index.rootId).toBe("n1");
  });

  it("resolves only known node ids", () => {
    const compiled = compileMathDocument(String.raw`a+b`);
    expect(resolveCompiledNodeId(compiled, "n1")).toBe("n1");
    expect(resolveCompiledNodeId(compiled, "n999")).toBeNull();
    expect(resolveCompiledNodeId(compiled, null)).toBeNull();
  });
});
