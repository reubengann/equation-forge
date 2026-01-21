/**
 * Helpers to convert differentials between our canonical display LaTeX
 * (`\mathrm{d}{x}`) and the MathLive-friendly form (`\differentialD x`).
 * We also scrub MathLive internal aliases (e.g. `d_upright`, `Nothing`)
 * so callers never see non-standard tokens.
 */

// Canonicalize a few common variants of \mathrm{d} into MathLive's \differentialD
export function toMathLiveLatex(displayLatex: string): string {
  if (!displayLatex) return displayLatex ?? "";
  let s = displayLatex;

  // \mathrm{d}{x}  -> \differentialD x
  s = s.replace(/\\mathrm\{d\}\s*\{([^{}]+)\}/g, (_m, v) => String.raw`\differentialD ${v}`);

  // \mathrm{d}x -> \differentialD x
  s = s.replace(/\\mathrm\{d\}\s*([A-Za-z])/g, (_m, v) => String.raw`\differentialD ${v}`);

  // If users already wrote \mathrm{d}\theta (non-braced greek/commands), brace it.
  s = s.replace(/\\mathrm\{d\}\s*(\\[A-Za-z]+)\b/g, (_m, v) => String.raw`\differentialD {${v}}`);

  // Bare \mathrm{d} (no operand) -> MathLive differential operator.
  s = s.replace(/\\mathrm\{d\}(?![A-Za-z{\\])/g, String.raw`\differentialD `);

  return s;
}

// Convert MathLive-emitted LaTeX into our canonical display form.
export function fromMathLiveLatex(mathLiveLatex: string): string {
  if (!mathLiveLatex) return mathLiveLatex ?? "";
  let s = mathLiveLatex;

  // Normalize MathLive internals first.
  s = s.replace(/\\?d_upright/g, String.raw`\mathrm{d}`);
  s = s.replace(/\\?dNothing/g, String.raw`\mathrm{d}`);
  s = s.replace(/\\mathrm\{d\}\s*\{?Nothing\}?/g, String.raw`\mathrm{d}`);
  s = s.replace(/\bNothing\b/g, "");

  // \differentialD x -> \mathrm{d}{x}
  s = s.replace(/\\differentialD\s*\{([^{}]+)\}/g, (_m, v) => String.raw`\mathrm{d}{${v}}`);
  s = s.replace(/\\differentialD\s+([A-Za-z])/g, (_m, v) => String.raw`\mathrm{d}{${v}}`);
  s = s.replace(/\\differentialD\s+(\\[A-Za-z]+)\b/g, (_m, v) => String.raw`\mathrm{d}{${v}}`);

  // Ensure plain \mathrm{d}x forms get braced.
  s = s.replace(/\\mathrm\{d\}\s*([A-Za-z])/g, (_m, v) => String.raw`\mathrm{d}{${v}}`);
  s = s.replace(/\\mathrm\{d\}\s*(\\[A-Za-z]+)\b/g, (_m, v) => String.raw`\mathrm{d}{${v}}`);

  // Collapse doubled spaces that may arise from removals.
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}
