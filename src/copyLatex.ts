export function formatEquationLatexForCopy(latex: string, wrapInDisplayMath: boolean): string {
  return wrapInDisplayMath ? `$$${latex}$$` : latex;
}

export function formatEquationHistoryLatexForCopy(latexes: string[]): string {
  return latexes.map((latex) => formatEquationLatexForCopy(latex, true)).join("\n");
}
