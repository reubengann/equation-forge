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
  hat,
  innerProduct,
  immutableExpression,
  inequality,
  integral,
  multipleIntegral,
  multiply,
  negate,
  num,
  outerProduct,
  partialAtConstQuantity,
  partialDerivative,
  primed,
  power,
  secondOrderPartialDerivative,
  specialFont,
  sym,
  text,
  uniteratedIntegral,
  vector,
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
  | { kind: "differential"; variable: UnifiedNode[] }
  | { kind: "fraction"; numerator: UnifiedNode[]; denominator: UnifiedNode[] };

const FUNCTION_MACROS = new Set(["sin", "cos", "tan", "log", "ln", "exp", "sqrt"]);

class UnsupportedLatexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedLatexError";
  }
}

function parseTextArgument(content: UnifiedNode[] | undefined): string | null {
  if (!content) return "";
  const printable = content as unknown as Parameters<typeof printRaw>[0];
  return printRaw(printable);
}

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

  private canStartPrimary(token: Token | null): boolean {
    if (!token) return false;
    if (
      token.kind === "number" ||
      token.kind === "symbol" ||
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
      token.kind === "prod_symbol"
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

  private shouldExtractTrailingDifferential(tokens: Token[]): boolean {
    if (tokens.length < 2) return false;
    const last = tokens[tokens.length - 1];
    if (!last || last.kind !== "differential") return false;
    const leading = tokens.slice(0, -1);
    const parsed = this.parseFromSlice(leading);
    if (parsed.kind !== "display_group") return false;
    const unwrapped = parsed.expression;
    return (
      unwrapped.kind === "add" &&
      unwrapped.terms.length > 0 &&
      unwrapped.terms.every((term) => term.kind === "differential")
    );
  }

  private consumeUniteratedIntegralBody(): { integrand: Expr; variable: Expr | null } {
    const bodyTokens = this.consumeUntilEquationBoundary();
    if (bodyTokens.length === 0) {
      return { integrand: num(1), variable: null };
    }

    if (this.shouldExtractTrailingDifferential(bodyTokens)) {
      const trailingDifferential = bodyTokens[bodyTokens.length - 1];
      if (trailingDifferential?.kind === "differential") {
        const variable = parseGroupNodes(trailingDifferential.variable) ?? null;
        const leading = bodyTokens.slice(0, -1);
        const leadingExpr = this.parseFromSlice(leading);
        const integrand =
          leadingExpr.kind === "display_group"
            ? leadingExpr.expression
            : leadingExpr;
        return { integrand, variable };
      }
    }

    return { integrand: this.parseFromSlice(bodyTokens), variable: null };
  }

  private integralFromUniterated(body: { integrand: Expr; variable: Expr | null }): Expr {
    return integral(
      body.integrand,
      body.variable,
      null,
      null,
      body.variable ? "suffix" : "unknown",
    );
  }

  parseEquation(): Expr {
    const sides: Expr[] = [this.parseAdditive()];
    while (this.consumeOperator("=")) {
      sides.push(this.parseAdditive());
    }
    if (sides.length > 1) return equation(sides);

    const lhs = sides[0];
    if (this.consumeOperator("geq")) return inequality(lhs, "geq", this.parseAdditive());
    if (this.consumeOperator("leq")) return inequality(lhs, "leq", this.parseAdditive());
    if (this.consumeOperator("gt")) return inequality(lhs, "gt", this.parseAdditive());
    if (this.consumeOperator("lt")) return inequality(lhs, "lt", this.parseAdditive());
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
      if (next.kind === "prime") {
        this.next();
        expr =
          expr.kind === "primed"
            ? primed(expr.value, expr.order + next.order)
            : primed(expr, next.order);
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
      const hasBounds = lowerBound !== null || upperBound !== null;
      if (!hasBounds) {
        if (token.variant === "multiple") {
          const body = this.consumeUniteratedIntegralBody();
          return multipleIntegral(body.integrand, token.order, body.variable);
        }
        if (token.variant === "closed") {
          const body = this.consumeUniteratedIntegralBody();
          return closedIntegral(body.integrand, body.variable);
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
          return integral(
            nested,
            variable,
            null,
            null,
            variable ? "suffix" : "unknown",
          );
        }
        const body = this.consumeUniteratedIntegralBody();
        return uniteratedIntegral(body.integrand, body.variable);
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
  try {
    const nodes = parseMath(latex) as UnifiedNode[];
    if (!Array.isArray(nodes) || nodes.length === 0) return null;
    const parsed = parseGroupNodes(nodes);
    return parsed;
  } catch (error) {
    if (error instanceof UnsupportedLatexError) return null;
    throw error;
  }
}
