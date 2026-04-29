import { parseMath } from "@unified-latex/unified-latex-util-parse";
import {
  add,
  call,
  displayGroup,
  divide,
  equation,
  multiply,
  negate,
  num,
  power,
  sym,
  type DelimiterKind,
  type Expr,
} from "../../ast";

type UnifiedArgument = {
  content?: UnifiedNode[];
};

type UnifiedNode = {
  type?: string;
  content?: string;
  args?: UnifiedArgument[];
};

type Token =
  | { kind: "number"; value: number | string }
  | { kind: "symbol"; name: string }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" | "=" }
  | {
      kind: "open_group";
      delimiter: DelimiterKind;
      close: string;
      explicitLeftRight: boolean;
    }
  | { kind: "close_group"; value: string }
  | { kind: "exponent"; value: UnifiedNode[] }
  | { kind: "fraction"; numerator: UnifiedNode[]; denominator: UnifiedNode[] };

const FUNCTION_MACROS = new Set(["sin", "cos", "tan", "log", "ln", "exp", "sqrt"]);

function parseGroupNodes(nodes: UnifiedNode[] | undefined): Expr | null {
  if (!nodes || nodes.length === 0) return null;
  const tokens = tokenize(nodes);
  if (tokens.length === 0) return null;
  return new TokenParser(tokens).parseEquation();
}

function delimiterFromOpen(open: string): DelimiterKind {
  if (open === "(") return "paren";
  if (open === "[") return "bracket";
  if (open === "{") return "brace";
  if (open === "<") return "angle";
  return "other";
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
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    return { kind: "number", value: parseNumberString(value) };
  }
  return { kind: "symbol", name: value };
}

function mergeSubscript(tokens: Token[], i: number, node: UnifiedNode): number {
  const previous = tokens[tokens.length - 1];
  const argNodes = node.args?.[0]?.content;
  const subExpr = parseGroupNodes(argNodes);
  if (!previous || previous.kind !== "symbol" || !subExpr) return i;

  if (subExpr.kind === "symbol") {
    tokens[tokens.length - 1] = { kind: "symbol", name: `${previous.name}_${subExpr.name}` };
    return i;
  }
  if (subExpr.kind === "number") {
    tokens[tokens.length - 1] = {
      kind: "symbol",
      name: `${previous.name}_${String(subExpr.value)}`,
    };
  }
  return i;
}

function tokenize(nodes: UnifiedNode[]): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (!node || typeof node.type !== "string") continue;

    if (node.type === "whitespace") continue;

    if (node.type === "string") {
      const token = tokenFromStringContent(node.content ?? "");
      if (token) tokens.push(token);
      continue;
    }

    if (node.type !== "macro") continue;
    const macro = node.content ?? "";

    if (macro === "left") {
      const next = nodes[i + 1];
      const open = next?.type === "string" ? next.content ?? "" : "";
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
      if (next?.type === "string" && typeof next.content === "string") {
        tokens.push({ kind: "close_group", value: next.content });
        i += 1;
      }
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

    if (macro === "frac" && node.args?.[0]?.content && node.args?.[1]?.content) {
      tokens.push({
        kind: "fraction",
        numerator: node.args[0].content ?? [],
        denominator: node.args[1].content ?? [],
      });
      continue;
    }

    if (FUNCTION_MACROS.has(macro)) {
      tokens.push({ kind: "symbol", name: macro });
      continue;
    }

    tokens.push({ kind: "symbol", name: macro });
  }
  return tokens;
}

class TokenParser {
  private idx = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token | null {
    return this.tokens[this.idx + offset] ?? null;
  }

  private next(): Token | null {
    const token = this.peek();
    if (token) this.idx += 1;
    return token;
  }

  private consumeOperator(value: "+" | "-" | "*" | "/" | "="): boolean {
    const token = this.peek();
    if (!token || token.kind !== "operator" || token.value !== value) return false;
    this.idx += 1;
    return true;
  }

  private canStartPrimary(token: Token | null): boolean {
    if (!token) return false;
    if (token.kind === "number" || token.kind === "symbol" || token.kind === "fraction") {
      return true;
    }
    if (token.kind === "open_group") return true;
    return false;
  }

  parseEquation(): Expr {
    const sides: Expr[] = [this.parseAdditive()];
    while (this.consumeOperator("=")) {
      sides.push(this.parseAdditive());
    }
    return sides.length === 1 ? sides[0] : equation(sides);
  }

  private parseAdditive(): Expr {
    const terms: Expr[] = [this.parseMultiplicative()];
    while (true) {
      if (this.consumeOperator("+")) {
        terms.push(this.parseMultiplicative());
        continue;
      }
      if (this.consumeOperator("-")) {
        terms.push(negate(this.parseMultiplicative()));
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
        expr = divide(expr, this.parseUnary());
        continue;
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
    if (this.consumeOperator("-")) return negate(this.parseUnary());
    let expr = this.parsePrimary();
    while (true) {
      const next = this.peek();
      if (!next || next.kind !== "exponent") break;
      this.next();
      const exponent = parseGroupNodes(next.value) ?? sym("missing");
      expr = power(expr, exponent);
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
      return divide(numerator, denominator);
    }
    if (token.kind === "open_group") {
      const inner = this.parseAdditive();
      const maybeClose = this.peek();
      if (maybeClose && maybeClose.kind === "close_group") {
        this.next();
      }
      return displayGroup(token.delimiter, inner);
    }
    if (token.kind === "symbol") {
      const tokenName = token.name;
      const next = this.peek();
      if (FUNCTION_MACROS.has(tokenName) && next?.kind === "open_group") {
        const argExpr = this.parsePrimary();
        const arg =
          argExpr.kind === "display_group" ? argExpr.expression : argExpr;
        return call(sym(tokenName), [arg]);
      }
      return sym(tokenName);
    }

    return sym("unexpected");
  }
}

export function parseLatexToExprWithUnifiedLatex(latex: string): Expr | null {
  const nodes = parseMath(latex) as UnifiedNode[];
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  const parsed = parseGroupNodes(nodes);
  return parsed;
}
