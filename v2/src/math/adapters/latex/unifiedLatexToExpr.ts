import { parseMath } from "@unified-latex/unified-latex-util-parse";
import { printRaw } from "@unified-latex/unified-latex-util-print-raw";
import {
  add,
  absoluteValue,
  bigProd,
  bigSum,
  call,
  closedIntegral,
  differential,
  dottedExpr,
  displayGroup,
  divide,
  equation,
  fullDerivativeOperator,
  hat,
  innerProduct,
  immutableExpression,
  inequality,
  integral,
  limit,
  multipleIntegral,
  multiply,
  num,
  outerProduct,
  partialAtConstQuantity,
  partialDerivative,
  partialDerivativeOperator,
  primed,
  power,
  root,
  secondOrderPartialDerivative,
  specialFont,
  sym,
  text,
  uniteratedIntegral,
  vector,
  type DelimiterKind,
  type Expr,
} from "../../ast";
import { flipSign } from "../../rewrite/algebraUtils";

type UnifiedArgument = {
  content?: UnifiedNode[];
};

type UnifiedNode = {
  type?: string;
  content?: string | UnifiedNode[];
  args?: UnifiedArgument[];
};

type Token =
  | { kind: "number"; value: number | string }
  | { kind: "symbol"; name: string }
  | { kind: "function_symbol"; name: string }
  | { kind: "text"; value: string }
  | { kind: "absolute_bar" }
  | { kind: "vector"; value: UnifiedNode[] }
  | { kind: "hat"; value: UnifiedNode[] }
  | { kind: "dotted"; value: UnifiedNode[]; order: number }
  | { kind: "prime"; order: number }
  | {
      kind: "special_font";
      value: UnifiedNode[];
      font: "script" | "calligraphic" | "blackboard";
    }
  | { kind: "grouped_expr"; expression: Expr }
  | {
      kind: "operator";
      value:
        | "+"
        | "-"
        | "*"
        | "/"
        | "="
        | "dot"
        | "cross"
        | "geq"
        | "leq"
        | "gt"
        | "lt";
    }
  | {
      kind: "open_group";
      delimiter: DelimiterKind;
      close: string;
      explicitLeftRight: boolean;
    }
  | { kind: "close_group"; value: string }
  | { kind: "subscript"; value: UnifiedNode[] }
  | { kind: "exponent"; value: UnifiedNode[] }
  | { kind: "integral_symbol"; variant: "normal" | "closed" | "multiple"; order: number }
  | { kind: "sum_symbol" }
  | { kind: "prod_symbol" }
  | { kind: "limit_symbol" }
  | { kind: "root"; value: UnifiedNode[]; degree: UnifiedNode[] | null }
  | { kind: "differential"; variable: UnifiedNode[] }
  | { kind: "fraction"; numerator: UnifiedNode[]; denominator: UnifiedNode[] };

const FUNCTION_MACROS = new Set(["sin", "cos", "tan", "log", "ln", "exp"]);
const SYMBOL_MACROS = new Set([
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "varepsilon",
  "zeta",
  "eta",
  "theta",
  "vartheta",
  "iota",
  "kappa",
  "lambda",
  "mu",
  "nu",
  "xi",
  "pi",
  "varpi",
  "rho",
  "varrho",
  "sigma",
  "varsigma",
  "tau",
  "upsilon",
  "phi",
  "varphi",
  "chi",
  "psi",
  "omega",
  "Gamma",
  "Lambda",
  "Omega",
  "Phi",
  "Pi",
  "Psi",
  "Sigma",
  "Theta",
  "Upsilon",
  "Xi",
]);

class UnsupportedLatexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedLatexError";
  }
}

class InvalidLatexInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLatexInputError";
  }
}

function validateBalancedEntryDelimiters(latex: string): void {
  const stack: Array<{ open: "(" | "["; index: number }> = [];
  const matchingOpenByClose = {
    ")": "(",
    "]": "[",
  } as const;

  for (let index = 0; index < latex.length; index += 1) {
    const char = latex[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "(" || char === "[") {
      stack.push({ open: char, index });
      continue;
    }
    if (char === ")" || char === "]") {
      const expectedOpen = matchingOpenByClose[char];
      const previous = stack.pop();
      if (!previous || previous.open !== expectedOpen) {
        // Let the parser produce its richer mismatch message for cases like \sin(x].
        return;
      }
    }
  }

  const unclosed = stack.at(-1);
  if (unclosed) {
    throw new UnsupportedLatexError(
      `Unclosed delimiter ${unclosed.open} started at "${latex.slice(unclosed.index, unclosed.index + 5)}...)`,
    );
  }
}

export type UnifiedLatexParseErrorCode =
  | "empty_input"
  | "invalid_input"
  | "unsupported_latex"
  | "parser_error";

export type UnifiedLatexParseError = {
  code: UnifiedLatexParseErrorCode;
  message: string;
  cause?: unknown;
};

export type UnifiedLatexParseResult = {
  expr: Expr | null;
  error: UnifiedLatexParseError | null;
};

function parseTextArgument(content: UnifiedNode[] | undefined): string | null {
  if (!content) return "";
  const printable = content as unknown as Parameters<typeof printRaw>[0];
  return printRaw(printable);
}

function parseGroupNodes(
  nodes: UnifiedNode[] | undefined,
  sourceLatex?: string,
): Expr | null {
  if (!nodes || nodes.length === 0) return null;
  const tokens = tokenize(nodes);
  if (tokens.length === 0) return null;
  return new TokenParser(tokens, sourceLatex).parseEquation();
}

function delimiterFromOpen(open: string): DelimiterKind {
  if (open === "(") return "paren";
  if (open === "[") return "bracket";
  if (open === "{") return "brace";
  if (open === "<") return "angle";
  return "other";
}

function delimiterStringFromNode(node: UnifiedNode | undefined): string {
  if (!node) return "";
  const content = node.content;
  if (node.type === "string" && typeof content === "string") return content;
  if (node.type === "macro" && content === "lbrack") return "[";
  if (node.type === "macro" && content === "rbrack") return "]";
  if (node.type === "macro" && content === "{") return "{";
  if (node.type === "macro" && content === "}") return "}";
  return "";
}

function parseNumberString(value: string): number | string {
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function tokenFromStringContent(value: string): Token | null {
  if (value.trim().length === 0) return null;
  if (value === "+" || value === "-" || value === "*" || value === "/" || value === "=") {
    return { kind: "operator", value };
  }
  if (value === ">") return { kind: "operator", value: "gt" };
  if (value === "<") return { kind: "operator", value: "lt" };
  if (value === "(" || value === "[" || value === "{") {
    const close = value === "(" ? ")" : value === "[" ? "]" : "}";
    return {
      kind: "open_group",
      delimiter: delimiterFromOpen(value),
      close,
      explicitLeftRight: false,
    };
  }
  if (value === ")" || value === "]" || value === "}") {
    return { kind: "close_group", value };
  }
  if (value === "|") {
    return { kind: "absolute_bar" };
  }
  if (/^'+$/.test(value)) {
    return { kind: "prime", order: value.length };
  }
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    return { kind: "number", value: parseNumberString(value) };
  }
  return { kind: "symbol", name: value };
}

function mergeSubscript(tokens: Token[], i: number, node: UnifiedNode): number {
  const previous = tokens[tokens.length - 1];
  const argNodes = node.args?.[0]?.content;
  const subExpr = parseGroupNodes(argNodes);
  if (!previous || previous.kind !== "symbol" || !subExpr) {
    tokens.push({ kind: "subscript", value: argNodes ?? [] });
    return i;
  }

  if (subExpr.kind === "symbol") {
    tokens[tokens.length - 1] = { kind: "symbol", name: `${previous.name}_${subExpr.name}` };
    return i;
  }
  if (subExpr.kind === "number") {
    tokens[tokens.length - 1] = {
      kind: "symbol",
      name: `${previous.name}_${String(subExpr.value)}`,
    };
    return i;
  }
  tokens[tokens.length - 1] = {
    kind: "symbol",
    name: `${previous.name}_{${printRaw(argNodes as unknown as Parameters<typeof printRaw>[0])}}`,
  };
  return i;
}

function tokenize(nodes: UnifiedNode[]): Token[] {
  const tokens: Token[] = [];
  const containsLiteralBrace = (candidateNodes: UnifiedNode[] | undefined): boolean => {
    if (!candidateNodes) return false;
    return candidateNodes.some(
      (candidate) =>
        candidate?.type === "string" &&
        (candidate.content === "{" || candidate.content === "}"),
    );
  };
  const readInferredDifferential = (
    startIndex: number,
    options: { skipWhitespace?: boolean } = {},
  ): { variable: UnifiedNode[]; consumedNodes: number } | null => {
    let nextIndex = startIndex + 1;
    if (options.skipWhitespace) {
      while (nodes[nextIndex]?.type === "whitespace") {
        nextIndex += 1;
      }
    }
    const next = nodes[nextIndex];
    if (!next || next.type === "whitespace") return null;

    const withTrailingPrimes = (
      variable: UnifiedNode[],
      consumedNodes: number,
    ): { variable: UnifiedNode[]; consumedNodes: number } => {
      const variableNodes = [...variable];
      let consumed = consumedNodes;
      let primeIndex = startIndex + consumed + 1;
      while (true) {
        const candidate = nodes[primeIndex];
        if (
          !candidate ||
          candidate.type !== "string" ||
          typeof candidate.content !== "string" ||
          !/^'+$/.test(candidate.content)
        ) {
          break;
        }
        variableNodes.push(candidate);
        consumed += 1;
        primeIndex += 1;
      }
      return { variable: variableNodes, consumedNodes: consumed };
    };

    if (next.type === "group" && Array.isArray(next.content)) {
      return withTrailingPrimes(next.content, nextIndex - startIndex);
    }

    if (next.type === "macro") {
      const macro = typeof next.content === "string" ? next.content : "";
      if (macro === "left") {
        const open = delimiterStringFromNode(nodes[nextIndex + 1]);
        if (open === "(" || open === "[" || open === "{") {
          const close = open === "(" ? ")" : open === "[" ? "]" : "}";
          const variableNodes: UnifiedNode[] = [next, nodes[nextIndex + 1]!];
          let depth = 1;
          let i = nextIndex + 2;
          while (i < nodes.length) {
            const candidate = nodes[i];
            if (!candidate || candidate.type === "whitespace") break;
            variableNodes.push(candidate);
            if (candidate.type === "macro" && candidate.content === "left") {
              depth += 1;
              i += 2;
              if (nodes[i - 1]) variableNodes.push(nodes[i - 1]!);
              continue;
            }
            if (candidate.type === "macro" && candidate.content === "right") {
              const maybeClose = delimiterStringFromNode(nodes[i + 1]);
              if (maybeClose === close) {
                variableNodes.push(nodes[i + 1]!);
                depth -= 1;
                if (depth === 0) {
                  return withTrailingPrimes(variableNodes, i + 1 - startIndex);
                }
                i += 2;
                continue;
              }
            }
            i += 1;
          }
        }
      }
      return withTrailingPrimes([next], nextIndex - startIndex);
    }

    if (next.type !== "string" || typeof next.content !== "string") return null;
    const openToClose: Record<string, string> = {
      "(": ")",
      "[": "]",
      "{": "}",
    };
    const close = openToClose[next.content];
    if (close) {
      const variableNodes: UnifiedNode[] = [];
      let depth = 0;
      let i = nextIndex;
      while (i < nodes.length) {
        const candidate = nodes[i];
        if (!candidate || candidate.type === "whitespace") break;
        variableNodes.push(candidate);
        if (candidate.type === "string" && candidate.content === next.content) {
          depth += 1;
        } else if (candidate.type === "string" && candidate.content === close) {
          depth -= 1;
          if (depth === 0) {
            return withTrailingPrimes(variableNodes, i - startIndex);
          }
        }
        i += 1;
      }
      return null;
    }

    if (/^[a-zA-Z0-9]$/.test(next.content)) {
      return withTrailingPrimes([next], nextIndex - startIndex);
    }
    return null;
  };

  const getGroupContentAt = (index: number): UnifiedNode[] | null => {
    const groupNode = nodes[index];
    if (groupNode?.type !== "group") return null;
    return Array.isArray(groupNode.content) ? groupNode.content : null;
  };
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (!node || typeof node.type !== "string") continue;

    if (node.type === "whitespace") continue;

    if (node.type === "string") {
      const stringContent =
        typeof node.content === "string" ? node.content : "";
      if (/^\d$/.test(stringContent)) {
        let literal = stringContent;
        let dotCount = 0;
        let j = i + 1;
        while (j < nodes.length) {
          const nextNode = nodes[j];
          if (nextNode?.type !== "string" || typeof nextNode.content !== "string") break;
          if (/^\d$/.test(nextNode.content)) {
            literal += nextNode.content;
            j += 1;
            continue;
          }
          if (nextNode.content === "." && dotCount === 0) {
            literal += nextNode.content;
            dotCount += 1;
            j += 1;
            continue;
          }
          break;
        }
        if (/^\d+(?:\.\d+)?$/.test(literal)) {
          tokens.push({ kind: "number", value: parseNumberString(literal) });
          i = j - 1;
          continue;
        }
      }
      const trailingPrimeMatch = /^([A-Za-z0-9]+)('+)$/.exec(stringContent);
      if (trailingPrimeMatch) {
        const baseToken = tokenFromStringContent(trailingPrimeMatch[1]);
        if (baseToken) tokens.push(baseToken);
        tokens.push({ kind: "prime", order: trailingPrimeMatch[2].length });
        continue;
      }
      if (stringContent === "d") {
        const inferred = readInferredDifferential(i);
        if (inferred) {
          tokens.push({ kind: "differential", variable: inferred.variable });
          i += inferred.consumedNodes;
          continue;
        }
      }
      if (stringContent.endsWith("_")) {
        const next = nodes[i + 1];
        const nextGroupContent =
          next?.type === "group" && Array.isArray(next.content)
            ? next.content
            : undefined;
        const nextIsGroup = !!nextGroupContent;
        if (nextIsGroup) {
          const subExpr = parseGroupNodes(nextGroupContent);
          const base = stringContent.slice(0, -1);
          if (subExpr?.kind === "symbol") {
            tokens.push({ kind: "symbol", name: `${base}_${subExpr.name}` });
            i += 1;
            continue;
          }
          if (subExpr?.kind === "number") {
            tokens.push({
              kind: "symbol",
              name: `${base}_${String(subExpr.value)}`,
            });
            i += 1;
            continue;
          }
        }
      }
      const token = tokenFromStringContent(stringContent);
      if (token) tokens.push(token);
      continue;
    }

    if (node.type === "group") {
      const groupedContent = Array.isArray(node.content) ? node.content : [];
      const groupedExpr = parseGroupNodes(groupedContent);
      if (groupedExpr) {
        tokens.push({ kind: "grouped_expr", expression: groupedExpr });
      }
      continue;
    }

    if (node.type !== "macro") continue;
    const macro = typeof node.content === "string" ? node.content : "";

    if (macro === "placeholder") {
      throw new UnsupportedLatexError(
        "Math entry still contains placeholders. Fill or remove every placeholder before accepting.",
      );
    }

    if (macro === "left") {
      const next = nodes[i + 1];
      const open = delimiterStringFromNode(next);
      if (open === "(" || open === "[" || open === "{") {
        const close = open === "(" ? ")" : open === "[" ? "]" : "}";
        tokens.push({
          kind: "open_group",
          delimiter: delimiterFromOpen(open),
          close,
          explicitLeftRight: true,
        });
        i += 1;
      }
      continue;
    }

    if (macro === "right") {
      const next = nodes[i + 1];
      const close = delimiterStringFromNode(next);
      if (close) {
        tokens.push({ kind: "close_group", value: close });
        i += 1;
      }
      continue;
    }

    if (macro === "lbrack") {
      tokens.push({
        kind: "open_group",
        delimiter: "bracket",
        close: "]",
        explicitLeftRight: false,
      });
      continue;
    }

    if (macro === "rbrack") {
      tokens.push({ kind: "close_group", value: "]" });
      continue;
    }

    if (macro === "_") {
      i = mergeSubscript(tokens, i, node);
      continue;
    }

    if (macro === "^") {
      tokens.push({ kind: "exponent", value: node.args?.[0]?.content ?? [] });
      continue;
    }

    if (macro === "frac" || macro === "dfrac") {
      if (node.args?.[0]?.content && node.args?.[1]?.content) {
        if (
          containsLiteralBrace(node.args[0].content) ||
          containsLiteralBrace(node.args[1].content)
        ) {
          throw new InvalidLatexInputError(
            'Unclosed fraction started at "\\frac{a + ...)',
          );
        }
        tokens.push({
          kind: "fraction",
          numerator: node.args[0].content ?? [],
          denominator: node.args[1].content ?? [],
        });
        continue;
      }

      const group1 = getGroupContentAt(i + 1);
      const group2 = getGroupContentAt(i + 2);

      if (group1 && group2) {
        tokens.push({
          kind: "fraction",
          numerator: group1,
          denominator: group2,
        });
        i += 2;
        continue;
      }
    }

    if (macro === "int") {
      tokens.push({ kind: "integral_symbol", variant: "normal", order: 1 });
      continue;
    }

    if (macro === "oint") {
      tokens.push({ kind: "integral_symbol", variant: "closed", order: 1 });
      continue;
    }

    if (macro === "iint") {
      tokens.push({ kind: "integral_symbol", variant: "multiple", order: 2 });
      continue;
    }

    if (macro === "sum") {
      tokens.push({ kind: "sum_symbol" });
      continue;
    }

    if (macro === "prod") {
      tokens.push({ kind: "prod_symbol" });
      continue;
    }

    if (macro === "lim") {
      tokens.push({ kind: "limit_symbol" });
      continue;
    }

    if (macro === "sqrt") {
      const degreeNodes = node.args?.[0]?.content ?? null;
      const argNodes = node.args?.[1]?.content ?? node.args?.[0]?.content;
      if (argNodes) {
        tokens.push({ kind: "root", value: argNodes, degree: degreeNodes });
        continue;
      }
      const nextGroup = getGroupContentAt(i + 1);
      if (nextGroup) {
        tokens.push({ kind: "root", value: nextGroup, degree: null });
        i += 1;
        continue;
      }
      tokens.push({ kind: "root", value: [], degree: null });
      continue;
    }

    if (macro === "mathrm") {
      const arg = node.args?.[0]?.content;
      const argIsPlainD =
        !!arg &&
        arg.length === 1 &&
        arg[0]?.type === "string" &&
        arg[0]?.content === "d";
      let differentialStartIndex = i;
      const nextNode = nodes[i + 1];
      if (
        argIsPlainD &&
        nextNode?.type === "group" &&
        Array.isArray(nextNode.content) &&
        nextNode.content.length === 0
      ) {
        differentialStartIndex = i + 1;
      }
      const inferred = argIsPlainD ? readInferredDifferential(differentialStartIndex) : null;
      if (inferred) {
        tokens.push({ kind: "differential", variable: inferred.variable });
        i = differentialStartIndex + inferred.consumedNodes;
        continue;
      }
      if (argIsPlainD) {
        tokens.push({ kind: "symbol", name: "d" });
        continue;
      }
    }

    if (macro === "differentialD") {
      const inferred = readInferredDifferential(i, { skipWhitespace: true });
      if (inferred) {
        tokens.push({ kind: "differential", variable: inferred.variable });
        i += inferred.consumedNodes;
        continue;
      }
      tokens.push({ kind: "symbol", name: "d" });
      continue;
    }

    if (macro === "text") {
      const textArg = parseTextArgument(node.args?.[0]?.content);
      if (textArg === null) {
        throw new UnsupportedLatexError("unsupported_text_content");
      }
      tokens.push({ kind: "text", value: textArg });
      continue;
    }

    if (macro === "vec") {
      const argNodes = node.args?.[0]?.content;
      if (argNodes) {
        tokens.push({ kind: "vector", value: argNodes });
        continue;
      }
      const nextGroup = getGroupContentAt(i + 1);
      if (nextGroup) {
        tokens.push({ kind: "vector", value: nextGroup });
        i += 1;
        continue;
      }
      tokens.push({ kind: "vector", value: [] });
      continue;
    }

    if (macro === "hat") {
      const argNodes = node.args?.[0]?.content;
      if (argNodes) {
        tokens.push({ kind: "hat", value: argNodes });
        continue;
      }
      const nextGroup = getGroupContentAt(i + 1);
      if (nextGroup) {
        tokens.push({ kind: "hat", value: nextGroup });
        i += 1;
        continue;
      }
      tokens.push({ kind: "hat", value: [] });
      continue;
    }

    if (macro === "dot" || macro === "ddot") {
      const order = macro === "dot" ? 1 : 2;
      const argNodes = node.args?.[0]?.content;
      if (argNodes) {
        tokens.push({ kind: "dotted", value: argNodes, order });
        continue;
      }
      const nextGroup = getGroupContentAt(i + 1);
      if (nextGroup) {
        tokens.push({ kind: "dotted", value: nextGroup, order });
        i += 1;
        continue;
      }
      tokens.push({ kind: "dotted", value: [], order });
      continue;
    }

    if (macro === "mathscr" || macro === "mathcal" || macro === "mathbb") {
      const font =
        macro === "mathscr"
          ? "script"
          : macro === "mathcal"
            ? "calligraphic"
            : "blackboard";
      const argNodes = node.args?.[0]?.content;
      if (argNodes) {
        tokens.push({ kind: "special_font", value: argNodes, font });
        continue;
      }
      const nextGroup = getGroupContentAt(i + 1);
      if (nextGroup) {
        tokens.push({ kind: "special_font", value: nextGroup, font });
        i += 1;
        continue;
      }
      tokens.push({ kind: "special_font", value: [], font });
      continue;
    }

    if (macro === "cdot") {
      tokens.push({ kind: "operator", value: "dot" });
      continue;
    }

    if (macro === "times") {
      tokens.push({ kind: "operator", value: "cross" });
      continue;
    }

    if (macro === "geq") {
      tokens.push({ kind: "operator", value: "geq" });
      continue;
    }

    if (macro === "leq") {
      tokens.push({ kind: "operator", value: "leq" });
      continue;
    }

    if (macro === "Delta") {
      let lookahead = i + 1;
      while (nodes[lookahead]?.type === "whitespace") {
        lookahead += 1;
      }
      const nextNode = nodes[lookahead];
      if (nextNode?.type === "string" && typeof nextNode.content === "string") {
        if (/^[a-zA-Z0-9]$/.test(nextNode.content)) {
          tokens.push({ kind: "symbol", name: `\\Delta ${nextNode.content}` });
          i = lookahead;
          continue;
        }
      }
      if (nextNode?.type === "macro" && typeof nextNode.content === "string") {
        tokens.push({ kind: "symbol", name: `\\Delta ${nextNode.content}` });
        i = lookahead;
        continue;
      }
      tokens.push({ kind: "symbol", name: "\\Delta" });
      continue;
    }

    if (SYMBOL_MACROS.has(macro)) {
      tokens.push({ kind: "symbol", name: `\\${macro}` });
      continue;
    }

    if (macro === ",") {
      continue;
    }

    if (FUNCTION_MACROS.has(macro)) {
      tokens.push({ kind: "function_symbol", name: macro });
      continue;
    }

    tokens.push({ kind: "symbol", name: macro });
  }
  return tokens;
}

class TokenParser {
  private idx = 0;
  private readonly tokens: Token[];
  private readonly sourceLatex?: string;

  constructor(tokens: Token[], sourceLatex?: string) {
    this.tokens = tokens;
    this.sourceLatex = sourceLatex;
  }

  private peek(offset = 0): Token | null {
    return this.tokens[this.idx + offset] ?? null;
  }

  private next(): Token | null {
    const token = this.peek();
    if (token) this.idx += 1;
    return token;
  }

  private consumeOperator(
    value:
      | "+"
      | "-"
      | "*"
      | "/"
      | "="
      | "dot"
      | "cross"
      | "geq"
      | "leq"
      | "gt"
      | "lt",
  ): boolean {
    const token = this.peek();
    if (!token || token.kind !== "operator" || token.value !== value) return false;
    this.idx += 1;
    return true;
  }

  private isInequalityOperator(token: Token | null): boolean {
    return (
      token?.kind === "operator" &&
      (token.value === "geq" ||
        token.value === "leq" ||
        token.value === "gt" ||
        token.value === "lt")
    );
  }

  private canStartPrimary(token: Token | null): boolean {
    if (!token) return false;
    if (
      token.kind === "number" ||
      token.kind === "symbol" ||
      token.kind === "function_symbol" ||
      token.kind === "text" ||
      token.kind === "absolute_bar" ||
      token.kind === "vector" ||
      token.kind === "hat" ||
      token.kind === "dotted" ||
      token.kind === "special_font" ||
      token.kind === "grouped_expr" ||
      token.kind === "fraction" ||
      token.kind === "differential" ||
      token.kind === "integral_symbol" ||
      token.kind === "sum_symbol" ||
      token.kind === "prod_symbol" ||
      token.kind === "limit_symbol" ||
      token.kind === "root"
    ) {
      return true;
    }
    if (token.kind === "open_group") return true;
    return false;
  }

  private delimiterFromArgExpr(expr: Expr): "paren" | "bracket" | "bare" {
    if (expr.kind !== "display_group") return "bare";
    if (expr.delimiter === "paren") return "paren";
    if (expr.delimiter === "bracket") return "bracket";
    return "bare";
  }

  private parseFromSlice(tokens: Token[]): Expr {
    return new TokenParser(tokens, this.sourceLatex).parseEquation();
  }

  private openDelimiterFromClose(close: string): string {
    if (close === ")") return "(";
    if (close === "]") return "[";
    if (close === "}") return "{";
    return close;
  }

  private unclosedDelimiterErrorMessage(close: string): string {
    const open = this.openDelimiterFromClose(close);
    const source = this.sourceLatex ?? "";
    const startIndex = source.indexOf(open);
    const previewStart = startIndex >= 0 ? startIndex : 0;
    const preview = source.slice(previewStart, previewStart + 5);
    return `Unclosed delimiter ${open} started at "${preview}...)`;
  }

  private functionCallDelimiterMismatchMessage(
    functionName: string,
    expectedClose: string,
    actualClose: string,
  ): string {
    const open = this.openDelimiterFromClose(expectedClose);
    return `function call ${functionName} started with delimiter ${open} but ends with ${actualClose}. This is not supported.`;
  }

  private parseSubscriptExpr(token: Token): Expr | null {
    if (token.kind !== "subscript") return null;
    return parseGroupNodes(token.value);
  }

  private parsePositiveInteger(expr: Expr): number | null {
    if (expr.kind !== "number") return null;
    const value =
      typeof expr.value === "number"
        ? expr.value
        : /^\d+$/.test(expr.value)
          ? Number(expr.value)
          : NaN;
    if (!Number.isInteger(value) || value <= 0) return null;
    return value;
  }

  private parseFunctionCall(tokenName: string): Expr | null {
    const next = this.peek();
    if (next?.kind === "open_group") {
      const groupToken = this.next();
      if (!groupToken || groupToken.kind !== "open_group") return sym("missing");
      const inner = this.parseAdditive();
      const maybeClose = this.peek();
      if (maybeClose?.kind === "close_group") {
        if (maybeClose.value === groupToken.close) {
          this.next();
        } else {
          throw new UnsupportedLatexError(
            this.functionCallDelimiterMismatchMessage(
              tokenName,
              groupToken.close,
              maybeClose.value,
            ),
          );
        }
      } else {
        throw new UnsupportedLatexError(
          this.unclosedDelimiterErrorMessage(groupToken.close),
        );
      }
      const delimiter = this.delimiterFromArgExpr(
        displayGroup(groupToken.delimiter, inner),
      );
      return call(sym(tokenName), [inner], delimiter);
    }

    if (this.canStartPrimary(next)) {
      const argExpr = this.parseUnary();
      return call(sym(tokenName), [argExpr], "bare");
    }

    return null;
  }

  private factorList(expr: Expr): Expr[] {
    return expr.kind === "multiply" ? expr.factors : [expr];
  }

  private extractSecondOrderNumerator(numerator: Expr): {
    dependentVariable: Expr;
    degree: number;
  } | null {
    const factors = this.factorList(numerator);
    if (factors.length < 2) return null;
    const head = factors[0];
    if (head?.kind === "power" && head.base.kind === "symbol" && head.base.name === "partial") {
      const degree = this.parsePositiveInteger(head.exponent);
      if (!degree || degree < 2) return null;
      const dependentVariable =
        factors.length === 2 ? factors[1] : multiply(factors.slice(1));
      return { dependentVariable, degree };
    }
    if (head?.kind === "symbol" && head.name === "partial") {
      const compactPower = this.extractCompactPartialPower(factors.slice(1));
      if (compactPower) return compactPower;
    }
    return null;
  }

  private extractCompactPartialPower(factors: Expr[]): {
    dependentVariable: Expr;
    degree: number;
  } | null {
    const first = factors[0];
    if (!first || first.kind !== "symbol") return null;

    const combinedMatch = /^\^(\d+)(.+)$/.exec(first.name);
    if (combinedMatch) {
      const degree = Number(combinedMatch[1]);
      if (!Number.isInteger(degree) || degree < 2) return null;
      const dependentHead = sym(combinedMatch[2]!);
      const dependentVariable =
        factors.length === 1 ? dependentHead : multiply([dependentHead, ...factors.slice(1)]);
      return { dependentVariable, degree };
    }

    const exponentOnlyMatch = /^\^(\d+)$/.exec(first.name);
    if (!exponentOnlyMatch || factors.length < 2) return null;
    const degree = Number(exponentOnlyMatch[1]);
    if (!Number.isInteger(degree) || degree < 2) return null;
    const dependentVariable =
      factors.length === 2 ? factors[1]! : multiply(factors.slice(1));
    return { dependentVariable, degree };
  }

  private extractSecondOrderDenominator(denominator: Expr): {
    independentVariables: Expr[];
    degree: number;
  } | null {
    const factors = this.factorList(denominator);
    if (factors.length < 2) return null;
    const independentVariables: Expr[] = [];
    let degree = 0;
    let idx = 0;
    while (idx < factors.length) {
      const partialToken = factors[idx];
      if (
        !partialToken ||
        partialToken.kind !== "symbol" ||
        partialToken.name !== "partial"
      ) {
        return null;
      }
      const variableTerm = factors[idx + 1];
      if (!variableTerm) return null;
      if (variableTerm.kind === "power") {
        const exponent = this.parsePositiveInteger(variableTerm.exponent);
        if (!exponent) return null;
        independentVariables.push(variableTerm.base);
        degree += exponent;
      } else {
        independentVariables.push(variableTerm);
        degree += 1;
      }
      idx += 2;
    }
    if (degree < 2 || independentVariables.length === 0) return null;
    return { independentVariables, degree };
  }

  private extractSecondOrderPartialDerivative(
    numerator: Expr,
    denominator: Expr,
  ): Expr | null {
    const numeratorData = this.extractSecondOrderNumerator(numerator);
    if (!numeratorData) return null;
    const denominatorData = this.extractSecondOrderDenominator(denominator);
    if (!denominatorData) return null;
    if (numeratorData.degree !== denominatorData.degree) return null;
    return secondOrderPartialDerivative(
      numeratorData.dependentVariable,
      denominatorData.independentVariables,
      numeratorData.degree,
    );
  }

  private parseFractionExpression(numerator: Expr, denominator: Expr): Expr {
    if (
      this.isFullDerivativeMarker(numerator) &&
      denominator.kind === "differential"
    ) {
      return fullDerivativeOperator(
        denominator.variable,
        this.consumeDerivativeOperatorOperand(),
      );
    }
    if (this.isPartialDerivativeMarker(numerator)) {
      const partialVariable = this.extractPartialOperand(denominator);
      if (partialVariable) {
        return partialDerivativeOperator(
          partialVariable,
          this.consumeDerivativeOperatorOperand(),
        );
      }
    }
    const secondOrder = this.extractSecondOrderPartialDerivative(
      numerator,
      denominator,
    );
    if (secondOrder) return secondOrder;
    const partialQuantity = this.extractPartialOperand(numerator);
    const partialVariable = this.extractPartialOperand(denominator);
    if (partialQuantity && partialVariable) {
      return partialDerivative(partialQuantity, partialVariable);
    }
    return divide(numerator, denominator);
  }

  private extractPartialOperand(expr: Expr): Expr | null {
    if (expr.kind === "symbol" && expr.name === "partial") return null;
    if (expr.kind === "multiply" && expr.factors.length === 2) {
      const first = expr.factors[0];
      const second = expr.factors[1];
      if (first?.kind === "symbol" && first.name === "partial") {
        return second;
      }
    }
    return null;
  }

  private isFullDerivativeMarker(expr: Expr): boolean {
    return expr.kind === "symbol" && expr.name === "d";
  }

  private isPartialDerivativeMarker(expr: Expr): boolean {
    return expr.kind === "symbol" && expr.name === "partial";
  }

  private isBoundaryOperator(
    value: "+" | "-" | "*" | "/" | "=" | "dot" | "cross" | "geq" | "leq" | "gt" | "lt",
  ): boolean {
    return (
      value === "+" ||
      value === "-" ||
      value === "=" ||
      value === "geq" ||
      value === "leq" ||
      value === "gt" ||
      value === "lt"
    );
  }

  private consumeDerivativeOperatorOperand(): Expr {
    const operandTokens: Token[] = [];
    let depth = 0;
    while (true) {
      const token = this.peek();
      if (!token) break;
      if (depth === 0) {
        if (token.kind === "operator" && this.isBoundaryOperator(token.value)) break;
        if (token.kind === "close_group") break;
      }
      this.next();
      if (token.kind === "open_group") depth += 1;
      if (token.kind === "close_group") depth = Math.max(0, depth - 1);
      operandTokens.push(token);
    }
    if (operandTokens.length === 0) return sym("missing");
    return this.parseFromSlice(operandTokens);
  }

  private applyPostfixSubscript(base: Expr, subscript: Expr): Expr {
    const unwrappedBase =
      base.kind === "display_group" ? base.expression : base;
    if (unwrappedBase.kind === "partial_derivative") {
      return partialAtConstQuantity(
        unwrappedBase.quantity,
        unwrappedBase.variable,
        subscript,
      );
    }
    if (unwrappedBase.kind === "symbol" && subscript.kind === "symbol") {
      return sym(`${unwrappedBase.name}_${subscript.name}`);
    }
    return multiply([unwrappedBase, subscript]);
  }

  private consumeIntegralBody(): {
    integrand: Expr;
  } {
    const bodyTokens: Token[] = [];
    let depth = 0;

    while (true) {
      const token = this.peek();
      if (!token) break;
      if (depth === 0) {
        if (token.kind === "operator" && this.isBoundaryOperator(token.value)) break;
        if (token.kind === "close_group") break;
      }
      this.next();
      if (token.kind === "open_group") depth += 1;
      if (token.kind === "close_group") depth = Math.max(0, depth - 1);
      bodyTokens.push(token);
    }

    const integrand = bodyTokens.length > 0 ? this.parseFromSlice(bodyTokens) : num(1);
    return { integrand };
  }

  private consumeUntilEquationBoundary(): Token[] {
    const bodyTokens: Token[] = [];
    let depth = 0;
    while (true) {
      const token = this.peek();
      if (!token) break;
      if (depth === 0 && token.kind === "operator" && token.value === "=") break;
      this.next();
      if (token.kind === "open_group") depth += 1;
      if (token.kind === "close_group") depth = Math.max(0, depth - 1);
      bodyTokens.push(token);
    }
    return bodyTokens;
  }

  private consumeUniteratedIntegralBody(): { integrand: Expr } {
    const bodyTokens = this.consumeIntegralBodyTokens();
    if (bodyTokens.length === 0) {
      return { integrand: num(1) };
    }

    const integrand = this.parseFromSlice(bodyTokens);
    return { integrand };
  }

  private consumeIntegralBodyTokens(): Token[] {
    const bodyTokens: Token[] = [];
    let depth = 0;
    while (true) {
      const token = this.peek();
      if (!token) break;
      if (depth === 0) {
        if (token.kind === "operator" && this.isBoundaryOperator(token.value)) break;
        if (token.kind === "close_group") break;
      }
      this.next();
      if (token.kind === "open_group") depth += 1;
      if (token.kind === "close_group") depth = Math.max(0, depth - 1);
      bodyTokens.push(token);
    }
    return bodyTokens;
  }

  private integralFromUniterated(body: { integrand: Expr }): Expr {
    return integral(body.integrand, null, null);
  }

  parseEquation(): Expr {
    const sides: Expr[] = [this.parseAdditive()];
    while (this.consumeOperator("=")) {
      sides.push(this.parseAdditive());
    }
    if (sides.length > 1) {
      if (this.isInequalityOperator(this.peek())) {
        throw new UnsupportedLatexError(
          "Equation and inequality found in expression. This is not supported.",
        );
      }
      return equation(sides);
    }

    const lhs = sides[0];
    if (this.consumeOperator("geq")) {
      const rhs = this.parseAdditive();
      const nextToken = this.peek();
      if (nextToken?.kind === "operator" && nextToken.value === "=") {
        throw new UnsupportedLatexError(
          "Equation and inequality found in expression. This is not supported.",
        );
      }
      if (this.isInequalityOperator(this.peek())) {
        throw new UnsupportedLatexError(
          "Multiple inequalities found in expression. This is not supported.",
        );
      }
      return inequality(lhs, "geq", rhs);
    }
    if (this.consumeOperator("leq")) {
      const rhs = this.parseAdditive();
      const nextToken = this.peek();
      if (nextToken?.kind === "operator" && nextToken.value === "=") {
        throw new UnsupportedLatexError(
          "Equation and inequality found in expression. This is not supported.",
        );
      }
      if (this.isInequalityOperator(this.peek())) {
        throw new UnsupportedLatexError(
          "Multiple inequalities found in expression. This is not supported.",
        );
      }
      return inequality(lhs, "leq", rhs);
    }
    if (this.consumeOperator("gt")) {
      const rhs = this.parseAdditive();
      const nextToken = this.peek();
      if (nextToken?.kind === "operator" && nextToken.value === "=") {
        throw new UnsupportedLatexError(
          "Equation and inequality found in expression. This is not supported.",
        );
      }
      if (this.isInequalityOperator(this.peek())) {
        throw new UnsupportedLatexError(
          "Multiple inequalities found in expression. This is not supported.",
        );
      }
      return inequality(lhs, "gt", rhs);
    }
    if (this.consumeOperator("lt")) {
      const rhs = this.parseAdditive();
      const nextToken = this.peek();
      if (nextToken?.kind === "operator" && nextToken.value === "=") {
        throw new UnsupportedLatexError(
          "Equation and inequality found in expression. This is not supported.",
        );
      }
      if (this.isInequalityOperator(this.peek())) {
        throw new UnsupportedLatexError(
          "Multiple inequalities found in expression. This is not supported.",
        );
      }
      return inequality(lhs, "lt", rhs);
    }
    return lhs;
  }

  private parseAdditive(): Expr {
    const terms: Expr[] = [this.parseMultiplicative()];
    while (true) {
      if (this.consumeOperator("+")) {
        terms.push(this.parseMultiplicative());
        continue;
      }
      if (this.consumeOperator("-")) {
        terms.push(flipSign(this.parseMultiplicative()));
        continue;
      }
      break;
    }
    return terms.length === 1 ? terms[0] : add(terms);
  }

  private parseMultiplicative(): Expr {
    let expr = this.parseUnary();
    while (true) {
      if (this.consumeOperator("*")) {
        expr = this.mergeMultiply(expr, this.parseUnary());
        continue;
      }
      if (this.consumeOperator("/")) {
        let denominator = this.parseUnary();
        if (
          this.extractPartialOperand(expr) &&
          this.isPartialDerivativeMarker(denominator) &&
          this.canStartPrimary(this.peek())
        ) {
          denominator = multiply([denominator, this.parseUnary()]);
        }
        expr = this.parseFractionExpression(expr, denominator);
        continue;
      }
      if (this.consumeOperator("dot")) {
        return innerProduct([expr, this.parseMultiplicative()]);
      }
      if (this.consumeOperator("cross")) {
        return outerProduct([expr, this.parseMultiplicative()]);
      }
      const token = this.peek();
      if (this.canStartPrimary(token) && !(token?.kind === "operator" && token.value === "=")) {
        expr = this.mergeMultiply(expr, this.parseUnary());
        continue;
      }
      break;
    }
    return expr;
  }

  private mergeMultiply(left: Expr, right: Expr): Expr {
    if (left.kind === "multiply") return multiply([...left.factors, right]);
    return multiply([left, right]);
  }

  private parseUnary(): Expr {
    if (this.consumeOperator("+")) return this.parseUnary();
    if (this.consumeOperator("-")) return flipSign(this.parseUnary());
    let expr = this.parsePrimary();
    while (true) {
      const next = this.peek();
      if (!next) break;
      if (next.kind === "exponent") {
        this.next();
        const exponent = parseGroupNodes(next.value) ?? sym("missing");
        const primeOrder = primeOrderFromExponent(exponent);
        expr = primeOrder
          ? applyPrime(expr, primeOrder)
          : power(expr, exponent);
        continue;
      }
      if (next.kind === "subscript") {
        this.next();
        const subExpr = this.parseSubscriptExpr(next);
        if (subExpr) {
          expr = this.applyPostfixSubscript(expr, subExpr);
        }
        continue;
      }
      if (next.kind === "prime") {
        this.next();
        expr = applyPrime(expr, next.order);
        continue;
      }
      break;
    }
    return expr;
  }

  private parsePrimary(): Expr {
    const token = this.next();
    if (!token) return sym("missing");

    if (token.kind === "number") return num(token.value);
    if (token.kind === "fraction") {
      const numerator = parseGroupNodes(token.numerator) ?? sym("missing");
      const denominator = parseGroupNodes(token.denominator) ?? sym("missing");
      return this.parseFractionExpression(numerator, denominator);
    }
    if (token.kind === "grouped_expr") {
      return token.expression;
    }
    if (token.kind === "open_group") {
      const inner = this.parseAdditive();
      const maybeClose = this.peek();
      if (maybeClose && maybeClose.kind === "close_group" && maybeClose.value === token.close) {
        this.next();
      } else {
        throw new UnsupportedLatexError(
          this.unclosedDelimiterErrorMessage(token.close),
        );
      }
      return displayGroup(token.delimiter, inner);
    }
    if (token.kind === "integral_symbol") {
      let lowerBound: Expr | null = null;
      let upperBound: Expr | null = null;
      const lowerToken = this.peek();
      if (lowerToken?.kind === "subscript") {
        this.next();
        lowerBound = parseGroupNodes(lowerToken.value) ?? null;
      }
      const upperToken = this.peek();
      if (upperToken?.kind === "exponent") {
        this.next();
        upperBound = parseGroupNodes(upperToken.value) ?? null;
      }
      const hasBounds = lowerBound !== null || upperBound !== null;
      if (!hasBounds) {
        if (token.variant === "multiple") {
          const body = this.consumeUniteratedIntegralBody();
          return multipleIntegral(body.integrand, token.order);
        }
        if (token.variant === "closed") {
          const body = this.consumeUniteratedIntegralBody();
          return closedIntegral(body.integrand);
        }
        if (this.peek()?.kind === "integral_symbol") {
          const nestedRaw = this.parsePrimary();
          const nested =
            nestedRaw.kind === "uniterated_integral"
              ? this.integralFromUniterated(nestedRaw)
              : nestedRaw;
          let variable: Expr | null = null;
          const trailing = this.peek();
          if (trailing?.kind === "differential") {
            this.next();
            variable = parseGroupNodes(trailing.variable) ?? null;
          }
          if (!variable) return uniteratedIntegral(nested);
          return integral(
            multiply([nested, differential(variable)]),
            null,
            null,
          );
        }
        const body = this.consumeUniteratedIntegralBody();
        return uniteratedIntegral(body.integrand);
      }
      const body = this.consumeIntegralBody();
      return integral(body.integrand, lowerBound, upperBound);
    }
    if (token.kind === "sum_symbol") {
      let lowerBound: Expr | null = null;
      let upperBound: Expr | null = null;

      const lowerToken = this.peek();
      if (lowerToken?.kind === "subscript") {
        this.next();
        const lowerExpr = parseGroupNodes(lowerToken.value);
        if (
          lowerExpr?.kind === "equation" &&
          lowerExpr.sides.length === 2 &&
          lowerExpr.sides[0]?.kind === "symbol"
        ) {
          lowerBound = lowerExpr.sides[1] ?? null;
        } else {
          const printable = lowerToken.value as unknown as Parameters<typeof printRaw>[0];
          lowerBound = immutableExpression(printRaw(printable));
        }
      }

      const upperToken = this.peek();
      if (upperToken?.kind === "exponent") {
        this.next();
        upperBound = parseGroupNodes(upperToken.value) ?? null;
      }

      const summandTokens = this.consumeUntilEquationBoundary();
      const rawSummand =
        summandTokens.length > 0 ? this.parseFromSlice(summandTokens) : sym("missing");
      const summand =
        rawSummand.kind === "display_group" ? rawSummand.expression : rawSummand;
      return bigSum(summand, lowerBound, upperBound);
    }
    if (token.kind === "prod_symbol") {
      let lowerBound: Expr | null = null;
      let upperBound: Expr | null = null;

      const lowerToken = this.peek();
      if (lowerToken?.kind === "subscript") {
        this.next();
        const lowerExpr = parseGroupNodes(lowerToken.value);
        if (
          lowerExpr?.kind === "equation" &&
          lowerExpr.sides.length === 2 &&
          lowerExpr.sides[0]?.kind === "symbol"
        ) {
          lowerBound = lowerExpr.sides[1] ?? null;
        } else {
          const printable = lowerToken.value as unknown as Parameters<typeof printRaw>[0];
          lowerBound = immutableExpression(printRaw(printable));
        }
      }

      const upperToken = this.peek();
      if (upperToken?.kind === "exponent") {
        this.next();
        upperBound = parseGroupNodes(upperToken.value) ?? null;
      }

      const multiplicandTokens = this.consumeUntilEquationBoundary();
      const rawMultiplicand =
        multiplicandTokens.length > 0
          ? this.parseFromSlice(multiplicandTokens)
          : sym("missing");
      const muliplicand =
        rawMultiplicand.kind === "display_group"
          ? rawMultiplicand.expression
          : rawMultiplicand;
      return bigProd(muliplicand, lowerBound, upperBound);
    }
    if (token.kind === "limit_symbol") {
      let lowerBound: Expr | null = null;

      const lowerToken = this.peek();
      if (lowerToken?.kind === "subscript") {
        this.next();
        const printable = lowerToken.value as unknown as Parameters<typeof printRaw>[0];
        lowerBound = immutableExpression(printRaw(printable));
      }

      const expressionTokens = this.consumeUntilEquationBoundary();
      const rawExpression =
        expressionTokens.length > 0 ? this.parseFromSlice(expressionTokens) : sym("missing");
      const expression =
        rawExpression.kind === "display_group" ? rawExpression.expression : rawExpression;
      return limit(expression, lowerBound);
    }
    if (token.kind === "root") {
      const value = parseGroupNodes(token.value) ?? sym("missing");
      const degreeExpr = token.degree ? parseGroupNodes(token.degree) : null;
      const degree = degreeExpr ? this.parsePositiveInteger(degreeExpr) ?? 2 : 2;
      return root(value, degree);
    }
    if (token.kind === "differential") {
      const variable = parseGroupNodes(token.variable) ?? sym("missing");
      return differential(variable);
    }
    if (token.kind === "absolute_bar") {
      const innerTokens: Token[] = [];
      let depth = 0;
      while (true) {
        const nextToken = this.peek();
        if (!nextToken) break;
        this.next();
        if (nextToken.kind === "absolute_bar" && depth === 0) {
          break;
        }
        if (nextToken.kind === "open_group") {
          depth += 1;
        } else if (nextToken.kind === "close_group") {
          depth = Math.max(0, depth - 1);
        }
        innerTokens.push(nextToken);
      }
      const value =
        innerTokens.length > 0 ? this.parseFromSlice(innerTokens) : sym("missing");
      return absoluteValue(value);
    }
    if (token.kind === "text") {
      return text(token.value);
    }
    if (token.kind === "vector") {
      const value = parseGroupNodes(token.value) ?? sym("missing");
      return vector(value);
    }
    if (token.kind === "hat") {
      const value = parseGroupNodes(token.value) ?? sym("missing");
      return hat(value);
    }
    if (token.kind === "dotted") {
      const value = parseGroupNodes(token.value) ?? sym("missing");
      return dottedExpr(value, token.order);
    }
    if (token.kind === "special_font") {
      const value = parseGroupNodes(token.value) ?? sym("missing");
      return specialFont(value, token.font);
    }
    if (token.kind === "symbol") {
      return sym(token.name);
    }
    if (token.kind === "function_symbol") {
      const tokenName = token.name;
      const next = this.peek();

      if (next?.kind === "exponent") {
        this.next();
        const exponent = parseGroupNodes(next.value) ?? sym("missing");
        const functionCall = this.parseFunctionCall(tokenName);
        return functionCall ? power(functionCall, exponent) : power(sym(tokenName), exponent);
      }

      return this.parseFunctionCall(tokenName) ?? sym(tokenName);
    }

    return sym("unexpected");
  }
}

function applyPrime(expr: Expr, order: number): Expr {
  if (expr.kind === "primed") return primed(expr.value, expr.order + order);
  if (expr.kind === "differential") return differential(applyPrime(expr.variable, order));
  return primed(expr, order);
}

function primeOrderFromExponent(exponent: Expr): number | null {
  if (exponent.kind === "symbol" && exponent.name === "prime") return 1;
  if (exponent.kind !== "multiply") return null;

  let order = 0;
  for (const factor of exponent.factors) {
    if (factor.kind !== "symbol" || factor.name !== "prime") return null;
    order += 1;
  }
  return order > 0 ? order : null;
}

export function parseLatexToExprWithUnifiedLatexResult(
  latex: string,
): UnifiedLatexParseResult {
  try {
    validateBalancedEntryDelimiters(latex);
    const nodes = parseMath(latex) as UnifiedNode[];
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return {
        expr: null,
        error: {
          code: "empty_input",
          message: "Input LaTeX is empty.",
        },
      };
    }
    const parsed = parseGroupNodes(nodes, latex);
    if (!parsed) {
      return {
        expr: null,
        error: {
          code: "unsupported_latex",
          message: "Input LaTeX could not be parsed into an expression tree.",
        },
      };
    }
    return { expr: parsed, error: null };
  } catch (error) {
    if (error instanceof InvalidLatexInputError) {
      return {
        expr: null,
        error: {
          code: "invalid_input",
          message: error.message,
          cause: error,
        },
      };
    }
    if (error instanceof UnsupportedLatexError) {
      return {
        expr: null,
        error: {
          code: "unsupported_latex",
          message: error.message,
          cause: error,
        },
      };
    }
    const message =
      error instanceof Error ? error.message : "Unknown parser failure.";
    return {
      expr: null,
      error: {
        code: "parser_error",
        message: `Parser failure while reading LaTeX: ${message}`,
        cause: error,
      },
    };
  }
}

export function parseLatexToExprWithUnifiedLatex(latex: string): Expr | null {
  return parseLatexToExprWithUnifiedLatexResult(latex).expr;
}
