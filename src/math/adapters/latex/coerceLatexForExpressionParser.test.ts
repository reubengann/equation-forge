import { describe, expect, it } from "vitest";
import { coerceLatexForExpressionParser } from "./coerceLatexForExpressionParser";

describe("coerceLatexForExpressionParser", () => {
  it("unwraps a stale MathLive eqnarray shell with one meaningful expression", () => {
    const result = coerceLatexForExpressionParser(
      String.raw`\begin{eqnarray}\left(\frac{\partial{F}}{\partial{T}}\right)_{X_1,X_2}=-S \quad \quad & & {}\end{eqnarray}`,
    );

    expect(result.latex).toBe(
      String.raw`\left(\frac{\partial{F}}{\partial{T}}\right)_{X_1,X_2}=-S`,
    );
  });

  it("strips a trailing tag from the one meaningful cell", () => {
    const result = coerceLatexForExpressionParser(
      String.raw`\begin{eqnarray}a=b\tag{7-32} & & {}\end{eqnarray}`,
    );

    expect(result.latex).toBe(String.raw`a=b`);
  });

  it("uses the first meaningful cell when an environment has multiple cells", () => {
    const latex = String.raw`\begin{eqnarray}a=b & c=d & {}\end{eqnarray}`;

    expect(coerceLatexForExpressionParser(latex).latex).toBe(String.raw`a=b`);
  });

  it("uses the first meaningful cell from a full pasted eqnarray", () => {
    const result = coerceLatexForExpressionParser(String.raw`\begin{eqnarray}
\left(\frac{\partial{F}}{\partial{T}}\right)_{X_1 , X_2} = -S \quad \quad 
& \left(\frac{\partial{F}}{\partial{X_1}}\right)_{T , X_2} = -Y_1 \quad \quad
& \left(\frac{\partial{F}}{\partial{X_2}}\right)_{T , X_1} = -Y_2 \tag{7-32}
\end{eqnarray}`);

    expect(result.latex).toBe(
      String.raw`\left(\frac{\partial{F}}{\partial{T}}\right)_{X_1 , X_2} = -S`,
    );
  });

  it("uses the first meaningful cell when an environment has multiple rows", () => {
    const latex = String.raw`\begin{align}a=b \\ c=d\end{align}`;

    expect(coerceLatexForExpressionParser(latex).latex).toBe(String.raw`a=b`);
  });

  it("does not change an empty environment", () => {
    const latex = String.raw`\begin{eqnarray}{} & \quad & {}\end{eqnarray}`;

    expect(coerceLatexForExpressionParser(latex).latex).toBe(latex);
  });

  it("ignores alignment separators inside braces", () => {
    const result = coerceLatexForExpressionParser(
      String.raw`\begin{eqnarray}A_{T,P}=B & {}\end{eqnarray}`,
    );

    expect(result.latex).toBe(String.raw`A_{T,P}=B`);
  });
});
