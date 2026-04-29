import { parseMath } from "@unified-latex/unified-latex-util-parse";
import {
  add,
  call,
  differential,
  displayGroup,
  divide,
  equation,
  integral,
  multiply,
  negate,
  num,
  partialAtConstQuantity,
  partialDerivative,
  power,
  secondOrderPartialDerivative,
  sym,
  type DelimiterKind,
  type Expr,
} from "../../ast";

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
  | { kind: "grouped_expr"; expression: Expr }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" | "=" }
  | {
      kind: "open_group";
      delimiter: DelimiterKind;
      close: string;
      explicitLeftRight: boolean;
    }
  | { kind: "close_group"; value: string }
  | { kind: "subscript"; value: UnifiedNode[] }
  | { kind: "exponent"; value: UnifiedNode[] }
  | { kind: "integral_symbol" }
  | { kind: "differential"; variable: UnifiedNode[] }
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
  }
  return i;
}

function tokenize(nodes: UnifiedNode[]): Token[] {
  const tokens: Token[] = [];
  const readInferredDifferential = (
    startIndex: number,
  ): { variable: UnifiedNode[]; consumedNodes: number } | null => {
    const next = nodes[startIndex + 1];
    if (!next || next.type === "whitespace") return null;

    if (next.type === "group" && Array.isArray(next.content)) {
      return { variable: next.content, consumedNodes: 1 };
    }

    if (next.type === "macro") {
      return { variable: [next], consumedNodes: 1 };
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
      let i = startIndex + 1;
      while (i < nodes.length) {
        const candidate = nodes[i];
        if (!candidate || candidate.type === "whitespace") break;
        variableNodes.push(candidate);
        if (candidate.type === "string" && candidate.content === next.content) {
          depth += 1;
        } else if (candidate.type === "string" && candidate.content === close) {
          depth -= 1;
          if (depth === 0) {
            return {
              variable: variableNodes,
              consumedNodes: i - startIndex,
            };
          }
        }
        i += 1;
      }
      return null;
    }

    if (/^[a-zA-Z0-9]$/.test(next.content)) {
      return { variable: [next], consumedNodes: 1 };
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

    if (macro === "frac" || macro === "dfrac") {
      if (node.args?.[0]?.content && node.args?.[1]?.content) {
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
      tokens.push({ kind: "integral_symbol" });
      continue;
    }

    if (macro === "mathrm") {
      const arg = node.args?.[0]?.content;
      const argIsPlainD =
        !!arg &&
        arg.length === 1 &&
        arg[0]?.type === "string" &&
        arg[0]?.content === "d";
      const nextNode = nodes[i + 1];
      if (argIsPlainD && nextNode?.type === "group" && Array.isArray(nextNode.content)) {
        tokens.push({ kind: "differential", variable: nextNode.content });
        i += 1;
        continue;
      }
    }

    if (macro === ",") {
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
    if (
      token.kind === "number" ||
      token.kind === "symbol" ||
      token.kind === "grouped_expr" ||
      token.kind === "fraction" ||
      token.kind === "integral_symbol"
    ) {
      return true;
    }
    if (token.kind === "open_group") return true;
    return false;
  }

  private parseFromSlice(tokens: Token[]): Expr {
    return new TokenParser(tokens).parseEquation();
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
    if (head?.kind !== "power") return null;
    if (head.base.kind !== "symbol" || head.base.name !== "partial") return null;
    const degree = this.parsePositiveInteger(head.exponent);
    if (!degree || degree < 2) return null;
    const dependentVariable =
      factors.length === 2 ? factors[1] : multiply(factors.slice(1));
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
    variable: Expr | null;
    differentialSlot: "prefix" | "suffix" | "middle" | "unknown";
  } {
    const bodyTokens: Token[] = [];
    let depth = 0;
    let variable: Expr | null = null;
    let differentialIdx = -1;
    let differentialConsumedTokenCount = 0;

    while (true) {
      const token = this.peek();
      if (!token) break;
      if (depth === 0) {
        if (token.kind === "operator" && token.value === "=") break;
        if (token.kind === "differential") {
          this.next();
          variable = parseGroupNodes(token.variable) ?? null;
          differentialIdx = bodyTokens.length;
          differentialConsumedTokenCount = 1;
          continue;
        }
      }
      this.next();
      if (token.kind === "open_group") depth += 1;
      if (token.kind === "close_group") depth = Math.max(0, depth - 1);
      bodyTokens.push(token);
    }

    const integrand = bodyTokens.length > 0 ? this.parseFromSlice(bodyTokens) : num(1);

    let differentialSlot: "prefix" | "suffix" | "middle" | "unknown" = "unknown";
    if (variable !== null && differentialIdx === 0) {
      differentialSlot = "prefix";
    } else if (
      variable !== null &&
      differentialIdx >= 0 &&
      differentialIdx + differentialConsumedTokenCount >= bodyTokens.length + differentialConsumedTokenCount
    ) {
      differentialSlot = "suffix";
    } else if (variable !== null && differentialIdx > 0) {
      differentialSlot = "middle";
    }

    return { integrand, variable, differentialSlot };
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
      if (!next) break;
      if (next.kind === "exponent") {
        this.next();
        const exponent = parseGroupNodes(next.value) ?? sym("missing");
        expr = power(expr, exponent);
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
    if (token.kind === "grouped_expr") {
      return token.expression;
    }
    if (token.kind === "open_group") {
      const inner = this.parseAdditive();
      const maybeClose = this.peek();
      if (maybeClose && maybeClose.kind === "close_group") {
        this.next();
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
      const body = this.consumeIntegralBody();
      return integral(
        body.integrand,
        body.variable,
        lowerBound,
        upperBound,
        body.differentialSlot,
      );
    }
    if (token.kind === "differential") {
      const variable = parseGroupNodes(token.variable) ?? sym("missing");
      return differential(variable);
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
