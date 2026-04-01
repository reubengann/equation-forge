/**
 * Helpers to convert differentials between our canonical display LaTeX
 * (`\mathrm{d}{x}`) and the MathLive-friendly form (`\differentialD x`).
 * We also scrub MathLive internal aliases (e.g. `d_upright`, `Nothing`)
 * so callers never see non-standard tokens.
 */

function isSimpleOperand(value: string): boolean {
  return /^[A-Za-z]$/.test(value) || /^\\[A-Za-z]+$/.test(value);
}

function formatMathLiveDifferentialOperand(value: string): string {
  return isSimpleOperand(value) ? value : `{${value}}`;
}

function replaceCanonicalDifferentialGroups(input: string): string {
  const marker = String.raw`\mathrm{d}`;
  let out = "";
  let i = 0;
  while (i < input.length) {
    const start = input.indexOf(marker, i);
    if (start < 0) {
      out += input.slice(i);
      break;
    }
    out += input.slice(i, start);
    let j = start + marker.length;
    while (j < input.length && /\s/.test(input[j])) j += 1;
    if (j >= input.length || input[j] !== "{") {
      out += marker;
      i = start + marker.length;
      continue;
    }

    let depth = 0;
    let k = j;
    for (; k < input.length; k += 1) {
      if (input[k] === "{") depth += 1;
      else if (input[k] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (k >= input.length || depth !== 0) {
      out += marker;
      i = start + marker.length;
      continue;
    }
    const operand = input.slice(j + 1, k);
    out += String.raw`\differentialD ${formatMathLiveDifferentialOperand(operand)}`;
    i = k + 1;
  }
  return out;
}

function replaceMathLiveDifferentialGroups(input: string): string {
  const marker = String.raw`\differentialD`;
  let out = "";
  let i = 0;
  while (i < input.length) {
    const start = input.indexOf(marker, i);
    if (start < 0) {
      out += input.slice(i);
      break;
    }
    out += input.slice(i, start);
    let j = start + marker.length;
    while (j < input.length && /\s/.test(input[j])) j += 1;
    if (j >= input.length || input[j] !== "{") {
      out += marker;
      i = start + marker.length;
      continue;
    }

    let depth = 0;
    let k = j;
    for (; k < input.length; k += 1) {
      if (input[k] === "{") depth += 1;
      else if (input[k] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (k >= input.length || depth !== 0) {
      out += marker;
      i = start + marker.length;
      continue;
    }
    const operand = input.slice(j + 1, k);
    out += String.raw`\mathrm{d}{${operand}}`;
    i = k + 1;
  }
  return out;
}

// Canonicalize a few common variants of \mathrm{d} into MathLive's \differentialD
export function toMathLiveLatex(displayLatex: string): string {
  if (!displayLatex) return displayLatex ?? "";
  let s = replaceCanonicalDifferentialGroups(displayLatex);

  // \mathrm{d}{x}  -> \differentialD x
  s = s.replace(/\\mathrm\{d\}\s*\{([^{}]+)\}/g, (_m, v) =>
    String.raw`\differentialD ${formatMathLiveDifferentialOperand(v)}`
  );

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
  let s = replaceMathLiveDifferentialGroups(mathLiveLatex);

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
