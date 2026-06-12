const SUPPORTED_ENVIRONMENTS = new Set(["eqnarray", "align", "aligned", "gather", "multline", "split"]);

export type CoercedLatex = {
  latex: string;
};

type WrappedEnvironment = {
  name: string;
  body: string;
};

const SPACING_COMMANDS = new Set([
  ",",
  ":",
  ";",
  "!",
  " ",
  "quad",
  "qquad",
  "enspace",
  "thinspace",
  "medspace",
  "thickspace",
]);

export function coerceLatexForExpressionParser(latex: string): CoercedLatex {
  const wrapped = readWrappedEnvironment(latex);
  if (!wrapped || !SUPPORTED_ENVIRONMENTS.has(wrapped.name)) return { latex };

  const cells = splitTopLevelEnvironmentCells(wrapped.body);
  const meaningfulCells = cells
    .map((cell) => stripIgnorableCellEdges(stripTrailingTag(cell)))
    .filter((cell) => !isEmptyEnvironmentCell(cell));

  if (meaningfulCells.length === 0) return { latex };
  return { latex: meaningfulCells[0]! };
}

function readWrappedEnvironment(latex: string): WrappedEnvironment | null {
  const trimmed = latex.trim();
  const beginMatch = /^\\begin\{([A-Za-z*]+)\}/.exec(trimmed);
  if (!beginMatch) return null;

  const name = beginMatch[1]!;
  const endToken = String.raw`\end{${name}}`;
  if (!trimmed.endsWith(endToken)) return null;

  const body = trimmed.slice(beginMatch[0].length, trimmed.length - endToken.length);
  return { name, body };
}

function splitTopLevelEnvironmentCells(body: string): string[] {
  const cells: string[] = [];
  let current = "";
  let braceDepth = 0;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (char === "\\") {
      const next = body[index + 1];
      if (braceDepth === 0 && next === "\\") {
        cells.push(current);
        current = "";
        index += 1;
        continue;
      }
      current += char;
      if (next) {
        current += next;
        index += 1;
      }
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
    } else if (char === "}" && braceDepth > 0) {
      braceDepth -= 1;
    } else if (char === "&" && braceDepth === 0) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function stripTrailingTag(cell: string): string {
  const trimmed = cell.trim();
  const tagMatch = /\\tag\{[^{}]*\}\s*$/.exec(trimmed);
  if (!tagMatch) return cell;
  return trimmed.slice(0, tagMatch.index).trimEnd();
}

function isEmptyEnvironmentCell(cell: string): boolean {
  let rest = cell.trim();
  while (rest.length > 0) {
    const next = consumeEmptyCellToken(rest);
    if (next === rest) return false;
    rest = next.trimStart();
  }
  return true;
}

function stripIgnorableCellEdges(cell: string): string {
  let rest = cell.trim();
  while (rest.length > 0) {
    const leading = consumeEmptyCellToken(rest);
    if (leading === rest) break;
    rest = leading.trimStart();
  }

  while (rest.length > 0) {
    const next = stripTrailingEmptyCellToken(rest).trimEnd();
    if (next === rest) break;
    rest = next;
  }

  return rest;
}

function consumeEmptyCellToken(input: string): string {
  if (input.startsWith("{}")) return input.slice(2);
  if (input.startsWith("\\,")) return input.slice(2);
  if (input.startsWith("\\:")) return input.slice(2);
  if (input.startsWith("\\;")) return input.slice(2);
  if (input.startsWith("\\!")) return input.slice(2);
  if (input.startsWith("\\ ")) return input.slice(2);

  const commandMatch = /^\\([A-Za-z]+)/.exec(input);
  if (commandMatch && SPACING_COMMANDS.has(commandMatch[1]!)) {
    return input.slice(commandMatch[0].length);
  }

  return input;
}

function stripTrailingEmptyCellToken(input: string): string {
  const trimmed = input.trimEnd();
  if (trimmed.endsWith("{}")) return trimmed.slice(0, -2);

  for (const command of SPACING_COMMANDS) {
    const token = `\\${command}`;
    if (trimmed.endsWith(token)) return trimmed.slice(0, -token.length);
  }

  return input;
}
