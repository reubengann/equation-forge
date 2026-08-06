export type EquationCopySurroundMode = "none" | "display-math" | "equation-environment";

export function formatEquationLatexForCopy(latex: string, surroundMode: EquationCopySurroundMode): string {
  switch (surroundMode) {
    case "display-math":
      return `$$${latex}$$`;
    case "equation-environment":
      return `\\begin{equation}\n${latex}\n\\end{equation}`;
    default:
      return latex;
  }
}

export function formatEquationHistoryLatexForCopy(latexes: string[]): string {
  return latexes.map((latex) => formatEquationLatexForCopy(latex, "display-math")).join("\n");
}
