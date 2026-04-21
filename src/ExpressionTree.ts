export type MJ = string | number | MJNode;
export type MJNode = [op: string, ...args: MJ[]];

export type NodeInfo = {
  id: string;
  op: string;
  latex: string;
  json: MJ;
};

type ExpressionTreeOptions = {
  includeTrailingDifferentialThinspace?: boolean;
};

const FUNCTION_OPS = new Set([
  "Sin",
  "Cos",
  "Tan",
  "Arctan",
  "ArcTan",
  "Arcsin",
  "ArcSin",
  "Arccos",
  "ArcCos",
  "Exp",
  "Log",
  "Ln",
  "Abs",
  "Sqrt",
  "D",
]);

const GREEK_LATEX: Record<string, string> = {
  // Lowercase
  alpha: String.raw`\alpha`,
  beta: String.raw`\beta`,
  gamma: String.raw`\gamma`,
  // CE sometimes emits EulerGamma for \gamma.
  EulerGamma: String.raw`\gamma`,
  delta: String.raw`\delta`,
  epsilon: String.raw`\epsilon`,
  zeta: String.raw`\zeta`,
  eta: String.raw`\eta`,
  theta: String.raw`\theta`,
  iota: String.raw`\iota`,
  kappa: String.raw`\kappa`,
  lambda: String.raw`\lambda`,
  mu: String.raw`\mu`,
  nu: String.raw`\nu`,
  xi: String.raw`\xi`,
  omicron: String.raw`\omicron`,
  pi: String.raw`\pi`,
  rho: String.raw`\rho`,
  sigma: String.raw`\sigma`,
  tau: String.raw`\tau`,
  upsilon: String.raw`\upsilon`,
  phi: String.raw`\phi`,
  chi: String.raw`\chi`,
  psi: String.raw`\psi`,
  omega: String.raw`\omega`,
  // Standard uppercase macros
  Gamma: String.raw`\Gamma`,
  Delta: String.raw`\Delta`,
  Theta: String.raw`\Theta`,
  Lambda: String.raw`\Lambda`,
  Xi: String.raw`\Xi`,
  Pi: String.raw`\Pi`,
  Sigma: String.raw`\Sigma`,
  Upsilon: String.raw`\Upsilon`,
  Phi: String.raw`\Phi`,
  Psi: String.raw`\Psi`,
  Omega: String.raw`\Omega`,
};

function greekSymbolToLatex(name: string): string | null {
  return GREEK_LATEX[name] ?? null;
}

const SCRIPT_STYLE_REGEX = /^([A-Z])_(calligraphic|script)$/;
function calligraphicSymbolToLatex(name: string): string | null {
  const m = SCRIPT_STYLE_REGEX.exec(name);
  if (!m) return null;
  const letter = m[1];
  const style = m[2];
  if (style === "script") return String.raw`\mathscr{${letter}}`;
  return String.raw`\mathcal{${letter}}`;
}

export class ExpressionTree {
  readonly rootJson: MJ;

  readonly latexTagged: string;
  readonly latexPlain: string;
  readonly nodesById: Record<string, NodeInfo> = {};
  readonly parentById: Record<string, string | null> = {};
  readonly childrenById: Record<string, string[]> = {};
  readonly childIndexById: Record<string, number> = {};
  readonly pathById: Record<string, number[]> = {};
  readonly idByPath: Record<string, string> = {};
  private latexTaggedById: Record<string, string> = {};

  rootId!: string;

  /*
  For each node id, pathById[id] is the MathJSON path from the root to that node.

  [] → root
  [1] → first child
  [2] → second child
  [1, 2] → child 2 of child 1, etc.

  Example for "a + b = c + d":

  n1 Equal           path []
  ├─ n2 Add         path [1]
  │   ├─ n3 a       path [1,1]
  │   └─ n4 b       path [1,2]
  └─ n5 Add         path [2]
      ├─ n6 c       path [2,1]
      └─ n7 d       path [2,2]
  */

  private _leafLatex: (node: MJ) => string;
  private _includeTrailingDifferentialThinspace: boolean;

  private _nextId = 1;

  private wrap(id: string, contentLatex: string) {
    return String.raw`\htmlData{node-id="${id}"}{${contentLatex}}`;
  }

  private wrapData(attr: string, value: string, contentLatex: string) {
    return String.raw`\htmlData{${attr}="${value}"}{${contentLatex}}`;
  }

  private wrapFunctionArg(contentLatex: string) {
    return this.wrapData("fn-arg", "1", contentLatex);
  }

  private newId(): string {
    return `n${this._nextId++}`;
  }

  private partialInfo(expr: MJ): { order: number; operand: MJ | null } | null {
    if (expr === "PartialD") return { order: 1, operand: null };
    if (!Array.isArray(expr) || expr[0] !== "Partial") return null;
    const operand = (expr[1] ?? null) as MJ | null;
    if (operand == null) return { order: 1, operand: null };
    const nested = this.partialInfo(operand);
    if (nested) {
      return { order: nested.order + 1, operand: nested.operand };
    }
    return { order: 1, operand };
  }

  private isBarePartialOperator(expr: MJ): boolean {
    if (!Array.isArray(expr) || expr[0] !== "FractionPartialDerivative") return false;
    const numerator = (expr[1] ?? null) as MJ;
    const info = this.partialInfo(numerator);
    return Boolean(info && info.order === 1 && info.operand == null);
  }

  private shouldWrapAppliedOperand(expr: MJ): boolean {
    if (!Array.isArray(expr)) return false;
    return (
      expr[0] === "Add" ||
      expr[0] === "Equal" ||
      expr[0] === "InvisibleOperator" ||
      expr[0] === "Multiply" ||
      expr[0] === "Divide" ||
      expr[0] === "FractionDerivative" ||
      expr[0] === "FractionPartialDerivative" ||
      expr[0] === "Negate" ||
      expr[0] === "DotProduct"
    );
  }

  private renderPartialToken(info: { order: number; operand: MJ | null }): string {
    if (info.operand == null) {
      return info.order > 1
        ? String.raw`\partial^{${info.order}}`
        : String.raw`\partial`;
    }
    const operandLatex = ExpressionTree.create(info.operand).latexPlain;
    if (info.order > 1) {
      return String.raw`\partial^{${info.order}}{${operandLatex}}`;
    }
    return String.raw`\partial{${operandLatex}}`;
  }

  private renderPartialChain(expr: MJ): string | null {
    const direct = this.partialInfo(expr);
    if (direct) return this.renderPartialToken(direct);
    if (
      !Array.isArray(expr) ||
      (expr[0] !== "InvisibleOperator" && expr[0] !== "Multiply")
    ) {
      return null;
    }
    const factors = expr.slice(1) as MJ[];
    if (factors.length === 0) return null;
    const infos = factors.map((factor) => {
      const info = this.partialInfo(factor as MJ);
      if (!info) return null;
      return info;
    });
    if (infos.some((part) => part == null)) return null;
    const resolved = infos as { order: number; operand: MJ | null }[];
    const tokens: string[] = [];
    for (let i = 0; i < resolved.length; i += 1) {
      const info = resolved[i];
      if (info.operand != null && info.order === 1) {
        let runLength = 1;
        const key = JSON.stringify(info.operand);
        while (i + runLength < resolved.length) {
          const next = resolved[i + runLength];
          if (next.order !== 1 || next.operand == null) break;
          if (JSON.stringify(next.operand) !== key) break;
          runLength += 1;
        }
        if (runLength > 1) {
          const operandLatex = ExpressionTree.create(info.operand).latexPlain;
          tokens.push(String.raw`\partial{${operandLatex}^{${runLength}}}`);
          i += runLength - 1;
          continue;
        }
      }
      tokens.push(this.renderPartialToken(info));
    }
    return tokens.join(" ");
  }

  private emit(
    node: MJ,
    parentId: string | null,
    path: number[],
  ): { id: string; latexTagged: string; latexPlain: string } {
    const id = this.newId();
    if (parentId == null) {
      this.rootId = id;
    }
    this.parentById[id] = parentId;
    this.childrenById[id] = [];
    this.pathById[id] = path;
    this.idByPath[path.join(".")] = id;

    if (Array.isArray(node)) {
      const op = String(node[0]);
      if (op === "Add") {
        return this.recordTagged(this.emitAdd(node, id, path, op));
      }
      if (op === "Power") {
        return this.recordTagged(this.emitPower(node, id, path, op));
      }
      if (op === "Equal") {
        return this.recordTagged(this.emitEqual(node, id, path, op));
      }
      if (op == "Divide") {
        return this.recordTagged(this.emitDivide(node, id, path, op));
      }
      if (op === "FractionDerivative") {
        return this.recordTagged(
          this.emitFractionDerivative(node, id, path, op),
        );
      }
      if (op === "FractionPartialDerivative") {
        return this.recordTagged(
          this.emitFractionPartialDerivative(node, id, path, op),
        );
      }
      if (op === "Integrate") {
        return this.recordTagged(this.emitIntegrate(node, id, path, op));
      }
      if (op === "LatexString") {
        // Fallback node emitted by the Compute Engine for raw LaTeX snippets
        const s = String(node[1] ?? "");
        this.childrenById[id] = [];
        const plain = s;
        this.nodesById[id] = { id, op, latex: plain, json: node };
        return {
          id,
          latexPlain: plain,
          latexTagged: this.wrap(id, plain),
        };
      }
      if (op === "HorizontalSpacing") {
        // Ignore spacing nodes; render as empty.
        this.childrenById[id] = [];
        const plain = "";
        this.nodesById[id] = { id, op, latex: plain, json: node };
        return { id, latexPlain: plain, latexTagged: this.wrap(id, plain) };
      }
      if (op === "Partial") {
        return this.recordTagged(this.emitPartial(node, id, path, op));
      }
      if (op === "PartialDerivative") {
        return this.recordTagged(this.emitPartialDerivative(node, id, path, op));
      }
      if (op === "Tuple") {
        return this.recordTagged(this.emitTuple(node, id, path, op));
      }
      if (op === "InvisibleOperator") {
        return this.recordTagged(this.emitImplicitMultiply(node, id, path, op));
      }
      if (op === "DotProduct") {
        return this.recordTagged(this.emitDotProduct(node, id, path, op));
      }
      if (op == "Negate") {
        return this.recordTagged(this.emitNegate(node, id, path, op));
      }
      if (op === "Delimiter")
        return this.recordTagged(this.emitGroup(node, id, path, op, "(", ")"));
      if (op === "List")
        return this.recordTagged(this.emitGroup(node, id, path, op, "[", "]"));
      if (op === "Set")
        return this.recordTagged(this.emitGroup(node, id, path, op, "{", "}"));
      if (op == "Sequence")
        return this.recordTagged(this.emitSequence(node, id, path, op));
      if (op === "OverVector" || op === "Vector") {
        return this.recordTagged(this.emitVector(node, id, path, op));
      }
      if (op === "Subscript") {
        return this.recordTagged(this.emitSubscript(node, id, path, op));
      }
      if (op === "Apply") {
        return this.recordTagged(this.emitApply(node, id, path, op));
      }
      if (op === "Differential") {
        return this.recordTagged(this.emitDifferential(node, id, path, op));
      }
      if (op === "InexactDifferential") {
        return this.recordTagged(this.emitInexactDifferential(node, id, path, op));
      }
      if (op === "DeltaOfQuantity") {
        return this.recordTagged(this.emitDeltaOfQuantity(node, id, path, op));
      }
      if (op === "OverDot") {
        return this.recordTagged(this.emitOverDot(node, id, path, op));
      }
      if (op === "Prime") {
        return this.recordTagged(this.emitPrime(node, id, path, op));
      }
      if (op === "Derivative") {
        return this.recordTagged(this.emitDerivative(node, id, path, op));
      }
      if (op === "Degrees") {
        return this.recordTagged(this.emitDegrees(node, id, path, op));
      }
      if (op === "InverseFunction") {
        return this.recordTagged(this.emitInverseFunction(node, id, path, op));
      }
      if (FUNCTION_OPS.has(op)) {
        return this.recordTagged(this.emitFunctionCall(node, id, path, op));
      }
      throw Error(`${op} is not a known type of array`);
    }

    let plain = this._leafLatex(node);
    const op =
      typeof node === "string"
        ? "Symbol"
        : typeof node === "number"
          ? "Number"
          : "Atom";
    this.nodesById[id] = { id, op, latex: plain, json: node };

    if (typeof node === "string") {
      const calligraphicLatex = calligraphicSymbolToLatex(node);
      if (calligraphicLatex) {
        const taggedCalligraphic = this.wrap(id, calligraphicLatex);
        this.nodesById[id] = {
          id,
          op: "Symbol",
          latex: calligraphicLatex,
          json: node,
        };
        return {
          id,
          latexPlain: calligraphicLatex,
          latexTagged: taggedCalligraphic,
        };
      }

      const greekLatex = greekSymbolToLatex(node);
      if (greekLatex) {
        plain = greekLatex;
        this.nodesById[id] = { id, op: "Symbol", latex: plain, json: node };
        const taggedGreek = this.wrap(id, plain);
        return this.recordTagged({
          id,
          latexPlain: plain,
          latexTagged: taggedGreek,
        });
      }
    }

    // Render multi-letter lowercase identifiers upright to avoid unintended italics, e.g., f_max.
    // Keep mixed-case identifiers (e.g., fB) italic for physics-style variable names.
    // Skip if the symbol was already transformed by _leafLatex (e.g., DifferentialD -> \mathrm{d}).
    if (
      typeof node === "string" &&
      plain === node &&
      /^[a-z]{2,}$/.test(node)
    ) {
      const upright = String.raw`\mathrm{${node}}`;
      this.nodesById[id] = { id, op: "Symbol", latex: upright, json: node };
      const tagged = this.wrap(id, upright);
      return this.recordTagged({
        id,
        latexTagged: tagged,
        latexPlain: upright,
      });
    }

    if (typeof node === "string" && /^[A-Za-z]$/.test(node)) {
      const plain = node; // italic by default in math mode
      this.nodesById[id] = { id, op: "Symbol", latex: plain, json: node };
      const tagged = this.wrap(id, plain);
      return this.recordTagged({ id, latexTagged: tagged, latexPlain: plain });
    }
    const tagged = this.wrap(id, plain);
    return this.recordTagged({ id, latexPlain: plain, latexTagged: tagged });
  }

  constructor(mj: MJ, options?: ExpressionTreeOptions) {
    const normalized = normalizeVectors(mj);
    this.rootJson = normalized;
    this._includeTrailingDifferentialThinspace = Boolean(
      options?.includeTrailingDifferentialThinspace,
    );
    // Map atomic symbols to display forms before general leaf handling.
    this._leafLatex = (x) => {
      const asString = String(x);
      if (x === "DifferentialD") return String.raw`\mathrm{d}`;
      if (x === "PartialD") return String.raw`\partial`;
      if (x === "ExponentialE") return "e";
      const calligraphicLatex = calligraphicSymbolToLatex(asString);
      if (calligraphicLatex) return calligraphicLatex;
      return asString;
    };
    const parseResult = this.emit(normalized, null, []);
    const patchDiffD = (s: string) =>
      s.replace(/\\mathrm\{DifferentialD\}/g, String.raw`\mathrm{d}`);
    this.latexTagged = patchDiffD(parseResult.latexTagged);
    this.latexPlain = patchDiffD(parseResult.latexPlain);
  }

  private recordTagged<T extends { id: string; latexTagged: string }>(
    result: T,
  ): T {
    this.latexTaggedById[result.id] = result.latexTagged;
    return result;
  }

  private emitGroup(
    node: MJNode,
    id: string,
    path: number[],
    op: string,
    open: string,
    close: string,
  ) {
    // Shape is typically ["Delimiter", expr] (or Set/List similarly).
    const inner = this.emit(node[1], id, [...path, 1]);

    this.childrenById[id] = [inner.id];
    this.childIndexById[inner.id] = 0;

    // LaTeX escaping for { }
    const openLatex = open === "{" ? String.raw`\{` : open;
    const closeLatex = close === "}" ? String.raw`\}` : close;

    const plain = String.raw`\left${openLatex}${inner.latexPlain}\right${closeLatex}`;
    const taggedInner = String.raw`\left${openLatex}${inner.latexTagged}\right${closeLatex}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitNegate(node: MJNode, id: string, path: number[], op: string) {
    const inner = this.emit(node[1], id, [...path, 1]);

    this.childrenById[id] = [inner.id];
    this.childIndexById[inner.id] = 0;

    // Default unary render; Add will override into binary subtraction when appropriate.
    const innerInfo = this.nodesById[inner.id];
    const needsParens = innerInfo?.op === "Add" || innerInfo?.op === "Equal";
    const wrap = (s: string) =>
      needsParens ? String.raw`\left(${s}\right)` : s;

    const plain = `-${wrap(inner.latexPlain)}`;
    const taggedInner = `-${wrap(inner.latexTagged)}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return {
      id,
      latexPlain: plain,
      latexTagged: this.wrap(id, taggedInner),
    };
  }

  private emitImplicitMultiply(
    node: MJNode,
    id: string,
    path: number[],
    op: string,
  ) {
    const children = node
      .slice(1)
      .map((c: MJ, i: number) => this.emit(c, id, [...path, 1 + i]));

    this.childrenById[id] = children.map((ch) => ch.id);
    this.childrenById[id].forEach((cid, idx) => {
      this.childIndexById[cid] = idx;
    });

    const funcNameRaw = node[1];
    if (
      typeof funcNameRaw === "string" &&
      FUNCTION_OPS.has(funcNameRaw) &&
      children.length >= 2
    ) {
      const args = children.slice(1);
      const nameMap: Record<string, string> = {
        Sin: String.raw`\sin`,
        Cos: String.raw`\cos`,
        Tan: String.raw`\tan`,
        Arctan: String.raw`\arctan`,
        ArcTan: String.raw`\arctan`,
        Arcsin: String.raw`\arcsin`,
        ArcSin: String.raw`\arcsin`,
        Arccos: String.raw`\arccos`,
        ArcCos: String.raw`\arccos`,
        Exp: String.raw`\exp`,
        Log: String.raw`\log`,
        Ln: String.raw`\ln`,
        Abs: String.raw`\left|`,
        Sqrt: String.raw`\sqrt`,
        D: "D",
      };
      const fnLatex = nameMap[funcNameRaw] ?? funcNameRaw;
      const taggedFnLatex =
        funcNameRaw === "Abs" || funcNameRaw === "Sqrt"
          ? fnLatex
          : this.wrap(id, fnLatex);
      const argsPlain = args.map((a) => a.latexPlain).join(", ");
      const argsTagged = args.map((a) => a.latexTagged).join(", ");
      const singleIsDelimiter =
        args.length === 1 && this.nodesById[args[0].id]?.op === "Delimiter";
      const plain =
        funcNameRaw === "Abs"
          ? String.raw`${fnLatex}${argsPlain}\right|`
          : funcNameRaw === "Sqrt" && args.length === 1
            ? String.raw`${fnLatex}{${argsPlain}}`
          : singleIsDelimiter
            ? `${fnLatex}${argsPlain}`
            : `${fnLatex}\\left(${argsPlain}\\right)`;
      const taggedInner =
        funcNameRaw === "Abs"
          ? String.raw`${taggedFnLatex}${argsTagged}\right|`
          : funcNameRaw === "Sqrt" && args.length === 1
            ? String.raw`${taggedFnLatex}{${argsTagged}}`
          : singleIsDelimiter
            ? `${taggedFnLatex}${argsTagged}`
            : `${taggedFnLatex}\\left(${argsTagged}\\right)`;

      this.nodesById[id] = { id, op, latex: plain, json: node };
      return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
    }

    // Thin space for implicit multiplication
    const sep = String.raw`\,`;
    const wrappedChildren = children.map((child) => {
      const childOp = this.nodesById[child.id]?.op;
      const needsParens = childOp === "Add" || childOp === "Equal";
      if (!needsParens) return child;
      return {
        ...child,
        latexPlain: String.raw`\left(${child.latexPlain}\right)`,
        latexTagged: String.raw`\left(${child.latexTagged}\right)`,
      };
    });
    const isAppliedPartialOperator =
      node.length === 3 && this.isBarePartialOperator(node[1] as MJ);
    const renderedChildren = [...wrappedChildren];
    if (isAppliedPartialOperator && renderedChildren.length >= 2) {
      const operatorChild = renderedChildren[0];
      renderedChildren[0] = {
        ...operatorChild,
        latexPlain: String.raw`\left(${operatorChild.latexPlain}\right)`,
        latexTagged: String.raw`\left(${operatorChild.latexTagged}\right)`,
      };
      const operandExpr = node[2] as MJ;
      if (this.shouldWrapAppliedOperand(operandExpr)) {
        const operandChild = renderedChildren[1];
        renderedChildren[1] = {
          ...operandChild,
          latexPlain: String.raw`\left(${operandChild.latexPlain}\right)`,
          latexTagged: String.raw`\left(${operandChild.latexTagged}\right)`,
        };
      }
    }

    const trailingDifferentialSpacingEnabled =
      this._includeTrailingDifferentialThinspace && renderedChildren.length >= 2;
    const lastRenderedChild = renderedChildren[renderedChildren.length - 1];
    const lastRenderedChildOp = lastRenderedChild
      ? this.nodesById[lastRenderedChild.id]?.op
      : null;
    const hasTrailingDifferential =
      lastRenderedChildOp === "Differential" ||
      lastRenderedChildOp === "InexactDifferential";
    const plain =
      trailingDifferentialSpacingEnabled && hasTrailingDifferential
        ? (() => {
            const prefix = renderedChildren
              .slice(0, renderedChildren.length - 1)
              .map((c) => c.latexPlain)
              .join(" ");
            return `${prefix} ${String.raw`\,`} ${lastRenderedChild.latexPlain}`;
          })()
        : renderedChildren.map((c) => c.latexPlain).join(" ");
    const taggedInner = renderedChildren.map((c) => c.latexTagged).join(sep);

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitDivide(node: MJNode, id: string, path: number[], op: string) {
    const num = this.emit(node[1], id, [...path, 1]);
    const den = this.emit(node[2], id, [...path, 2]);

    // childrenById / childIndexById
    this.childrenById[id] = [num.id, den.id];
    this.childIndexById[num.id] = 0;
    this.childIndexById[den.id] = 1;

    const plain = String.raw`\frac{${num.latexPlain}}{${den.latexPlain}}`;
    const taggedInner = String.raw`\frac{${num.latexTagged}}{${den.latexTagged}}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return {
      id,
      latexPlain: plain,
      latexTagged: this.wrap(id, taggedInner),
    };
  }

  private emitFractionDerivative(
    node: MJNode,
    id: string,
    path: number[],
    op: string,
  ) {
    const num = this.emit(node[1], id, [...path, 1]);
    const den = this.emit(node[2], id, [...path, 2]);

    this.childrenById[id] = [num.id, den.id];
    this.childIndexById[num.id] = 0;
    this.childIndexById[den.id] = 1;

    const plain = String.raw`\frac{${num.latexPlain}}{${den.latexPlain}}`;
    const taggedInner = String.raw`\frac{${num.latexTagged}}{${den.latexTagged}}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return {
      id,
      latexPlain: plain,
      latexTagged: this.wrap(id, taggedInner),
    };
  }

  private emitFractionPartialDerivative(
    node: MJNode,
    id: string,
    path: number[],
    op: string,
  ) {
    const num = this.emit(node[1], id, [...path, 1]);
    const den = this.emit(node[2], id, [...path, 2]);

    this.childrenById[id] = [num.id, den.id];
    this.childIndexById[num.id] = 0;
    this.childIndexById[den.id] = 1;

    const numRaw = (node[1] ?? null) as MJ;
    const denRaw = (node[2] ?? null) as MJ;
    const numPlain = this.renderPartialChain(numRaw) ?? String.raw`\partial{${num.latexPlain}}`;
    const denPlain = this.renderPartialChain(denRaw) ?? String.raw`\partial{${den.latexPlain}}`;
    // Atomic: no inner tagging
    const numTagged = numPlain;
    const denTagged = denPlain;

    const plain = String.raw`\frac{${numPlain}}{${denPlain}}`;
    const taggedInner = String.raw`\frac{${numTagged}}{${denTagged}}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return {
      id,
      latexPlain: plain,
      latexTagged: this.wrap(id, taggedInner),
    };
  }

  private emitPower(node: MJNode, id: string, path: number[], op: string) {
    // Shape: ["Power", base, exponent]
    const base = this.emit(node[1], id, [...path, 1]);
    const exp = this.emit(node[2], id, [...path, 2]);

    this.childrenById[id] = [base.id, exp.id];
    this.childIndexById[base.id] = 0;
    this.childIndexById[exp.id] = 1;

    const baseOp = this.nodesById[base.id]?.op;
    const baseNeedsParen =
      baseOp === "Add" ||
      baseOp === "Equal" ||
      baseOp === "Divide" ||
      baseOp === "FractionDerivative" ||
      baseOp === "FractionPartialDerivative" ||
      baseOp === "Negate";
    const wrap = (s: string) =>
      baseNeedsParen ? String.raw`\left(${s}\right)` : s;

    const plain = `${wrap(base.latexPlain)}^{${exp.latexPlain}}`;
    const taggedInner = `${wrap(base.latexTagged)}^{${exp.latexTagged}}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitVector(node: MJNode, id: string, path: number[], op: string) {
    const inner = this.emit(node[1], id, [...path, 1]);

    this.childrenById[id] = [inner.id];
    this.childIndexById[inner.id] = 0;

    const plain = String.raw`\vec{${inner.latexPlain}}`;
    const taggedInner = String.raw`\vec{${inner.latexTagged}}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitOverDot(node: MJNode, id: string, path: number[], op: string) {
    const rawInner = node[1] as MJ;
    let targetInner = rawInner;
    let count = typeof node[2] === "number" ? Number(node[2]) : 1;
    if (Array.isArray(rawInner) && rawInner[0] === "OverDot") {
      targetInner = (rawInner[1] ?? rawInner[1]) as MJ;
      const nestedCount = typeof rawInner[2] === "number" ? Number(rawInner[2]) : 1;
      count += nestedCount;
    }
    const inner = this.emit(targetInner, id, [...path, 1]);

    this.childrenById[id] = [inner.id];
    this.childIndexById[inner.id] = 0;

    const cmd = count >= 2 ? String.raw`\ddot` : String.raw`\dot`;

    const plain = String.raw`${cmd}{${inner.latexPlain}}`;
    const taggedInner = String.raw`${cmd}{${inner.latexTagged}}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitPrime(node: MJNode, id: string, path: number[], op: string) {
    const inner = this.emit(node[1], id, [...path, 1]);

    this.childrenById[id] = [inner.id];
    this.childIndexById[inner.id] = 0;

    const count = typeof node[2] === "number" ? Number(node[2]) : 1;
    const cmd = "'".repeat(count);

    const plain = String.raw`${inner.latexPlain}${cmd}`;
    const taggedInner = String.raw`${cmd}{${inner.latexTagged}}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitDerivative(node: MJNode, id: string, path: number[], op: string) {
    const children = node
      .slice(1)
      .map((childNode, i) => this.emit(childNode, id, [...path, i + 1]));

    this.childrenById[id] = children.map((c) => c.id);
    children.forEach((c, i) => (this.childIndexById[c.id] = i));

    if (children.length === 0) {
      const plain = String.raw`\mathrm{d}'`;
      this.nodesById[id] = { id, op, latex: plain, json: node };
      return { id, latexPlain: plain, latexTagged: this.wrap(id, plain) };
    }

    if (children.length === 1) {
      const operand = children[0];
      const plain = String.raw`\mathrm{d}'{${operand.latexPlain}}`;
      const taggedInner = String.raw`\mathrm{d}'{${operand.latexTagged}}`;
      this.nodesById[id] = { id, op, latex: plain, json: node };
      return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
    }

    const argsPlain = children.map((c) => c.latexPlain).join(", ");
    const argsTagged = children.map((c) => c.latexTagged).join(", ");
    const plain = String.raw`\operatorname{Derivative}\left(${argsPlain}\right)`;
    const taggedInner = String.raw`\operatorname{Derivative}\left(${argsTagged}\right)`;
    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitDegrees(node: MJNode, id: string, path: number[], op: string) {
    const inner = this.emit(node[1], id, [...path, 1]);

    this.childrenById[id] = [inner.id];
    this.childIndexById[inner.id] = 0;

    const innerInfo = this.nodesById[inner.id];
    const needsParens = innerInfo?.op === "Add" || innerInfo?.op === "Equal";
    const wrap = (s: string) =>
      needsParens ? String.raw`\left(${s}\right)` : s;

    const plain = `${wrap(inner.latexPlain)}^{\\circ}`;
    const taggedInner = `${wrap(inner.latexTagged)}^{\\circ}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitSubscript(node: MJNode, id: string, path: number[], op: string) {
    if (
      typeof node[1] === "string" &&
      /^[A-Z]$/.test(node[1]) &&
      (node[2] === "calligraphic" || node[2] === "script")
    ) {
      const base = this.emit(node[1], id, [...path, 1]);
      const sub = this.emit(node[2] as MJ, id, [...path, 2]);
      this.childrenById[id] = [base.id, sub.id];
      this.childIndexById[base.id] = 0;
      this.childIndexById[sub.id] = 1;

      const plain =
        node[2] === "script"
          ? String.raw`\mathscr{${node[1]}}`
          : String.raw`\mathcal{${node[1]}}`;
      this.nodesById[id] = { id, op, latex: plain, json: node };
      return { id, latexPlain: plain, latexTagged: this.wrap(id, plain) };
    }

    // Shape: ["Subscript", base, sub]
    const base = this.emit(node[1], id, [...path, 1]);
    const sub = this.emit(node[2], id, [...path, 2]);

    this.childrenById[id] = [base.id, sub.id];
    this.childIndexById[base.id] = 0;
    this.childIndexById[sub.id] = 1;

    const plain = `${base.latexPlain}_{${sub.latexPlain}}`;
    const taggedInner = `${base.latexTagged}_{${sub.latexTagged}}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitEqual(node: MJNode, id: string, path: number[], op: string) {
    const L = this.emit(node[1], id, [...path, 1]);
    const R = this.emit(node[2], id, [...path, 2]);
    this.childrenById[id] = [L.id, R.id];
    this.childIndexById[L.id] = 0;
    this.childIndexById[R.id] = 1;

    const plain = `${L.latexPlain} = ${R.latexPlain}`;
    const tagged = `${L.latexTagged} = ${R.latexTagged}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexTagged: this.wrap(id, tagged), latexPlain: plain };
  }

  private emitAdd(node: MJNode, id: string, path: number[], op: string) {
    const children = node
      .slice(1)
      .map((childNode, i) => this.emit(childNode, id, [...path, i + 1]));

    this.childrenById[id] = children.map((c) => c.id);
    children.forEach((c, i) => (this.childIndexById[c.id] = i));

    // Build plain/tagged by walking children once.
    const plainParts: string[] = [];
    const taggedParts: string[] = [];

    for (let i = 0; i < children.length; i++) {
      const childNode = node[i + 1];
      const child = children[i];

      if (i === 0) {
        // first term prints as-is (could be unary neg)
        plainParts.push(child.latexPlain);
        taggedParts.push(child.latexTagged);
        continue;
      }

      // If this term is Negate(x), render as " - x" (binary minus),
      // using the *already emitted* inner child of the Negate node.
      const isNegate =
        Array.isArray(childNode) &&
        String((childNode as MJNode)[0]) === "Negate";

      if (isNegate) {
        const negId = child.id;
        const innerId = (this.childrenById[negId] ?? [])[0];

        // Safety fallback: if something's off, use the child's latex as-is.
        if (!innerId) {
          plainParts.push(`+ ${child.latexPlain}`);
          taggedParts.push(`+ ${child.latexTagged}`);
          continue;
        }

        const innerInfo = this.nodesById[innerId];
        const innerOp = innerInfo?.op;

        const innerPlain = innerInfo?.latex ?? "";

        const innerEmitted = children.find((c) => c.id === innerId) ?? null;

        const innerTaggedLatex =
          innerEmitted?.latexTagged ??
          this.latexTaggedById[innerId] ??
          this.wrap(innerId, innerPlain);

        const needsParens = innerOp === "Add" || innerOp === "Equal";
        const pPlain = needsParens
          ? String.raw`\left(${innerPlain}\right)`
          : innerPlain;
        const pTagged = needsParens
          ? String.raw`\left(${innerTaggedLatex}\right)`
          : innerTaggedLatex;

        plainParts.push(`- ${pPlain}`);
        taggedParts.push(`- ${pTagged}`);
      } else {
        plainParts.push(`+ ${child.latexPlain}`);
        taggedParts.push(`+ ${child.latexTagged}`);
      }
    }

    const plain = plainParts.join(" ");
    const taggedInner = taggedParts.join(" ");

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitSequence(node: MJNode, id: string, path: number[], op: string) {
    const kids = node
      .slice(1)
      .map((childNode, i) => this.emit(childNode, id, [...path, i + 1]));

    this.childrenById[id] = kids.map((k) => k.id);
    kids.forEach((k, i) => (this.childIndexById[k.id] = i));

    const plain = kids.map((k) => k.latexPlain).join(", ");
    const taggedInner = kids.map((k) => k.latexTagged).join(", ");

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitTuple(node: MJNode, id: string, path: number[], op: string) {
    const kids = node
      .slice(1)
      .map((childNode, i) => this.emit(childNode, id, [...path, i + 1]));

    this.childrenById[id] = kids.map((k) => k.id);
    kids.forEach((k, i) => (this.childIndexById[k.id] = i));

    const plain = kids.map((k) => k.latexPlain).join(", ");
    const taggedInner = kids.map((k) => k.latexTagged).join(", ");

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitIntegrate(node: MJNode, id: string, path: number[], op: string) {
    // Shape: ["Integrate", integrand, ["Tuple", sym, lower?, upper?]]
    const integrand = this.emit(node[1], id, [...path, 1]);
    const tupleNode =
      Array.isArray(node[2]) && node[2][0] === "Tuple" ? node[2] : null;

    let sym: ReturnType<ExpressionTree["emit"]> | null = null;
    let lower: ReturnType<ExpressionTree["emit"]> | null = null;
    let upper: ReturnType<ExpressionTree["emit"]> | null = null;

    if (tupleNode) {
      sym = this.emit(tupleNode[1] ?? "x", id, [...path, 2, 1]);
      if (tupleNode.length >= 3) {
        lower = this.emit(tupleNode[2], id, [...path, 2, 2]);
      }
      if (tupleNode.length >= 4) {
        upper = this.emit(tupleNode[3], id, [...path, 2, 3]);
      }
    } else if (node.length >= 3) {
      sym = this.emit(node[2], id, [...path, 2]);
    }

    this.childrenById[id] = [integrand.id];
    this.childIndexById[integrand.id] = 0;
    if (sym) {
      this.childrenById[id].push(sym.id);
      this.childIndexById[sym.id] = this.childrenById[id].length - 1;
    }
    if (lower) {
      this.childrenById[id].push(lower.id);
      this.childIndexById[lower.id] = this.childrenById[id].length - 1;
    }
    if (upper) {
      this.childrenById[id].push(upper.id);
      this.childIndexById[upper.id] = this.childrenById[id].length - 1;
    }

    const integrandIsOne = integrand.latexPlain === "1";
    const boundsPlain =
      lower || upper
        ? `_{${lower?.latexPlain ?? ""}}^{${upper?.latexPlain ?? ""}}`
        : "";
    const dVarPlain = sym ? sym.latexPlain : "";
    const dVarTagged = sym ? sym.latexTagged : "";
    const integrandPlain = integrandIsOne ? "" : `${integrand.latexPlain} `;
    const integrandTagged = integrandIsOne ? "" : `${integrand.latexTagged} `;
    const hasResolvedDifferential =
      dVarPlain !== "" &&
      dVarPlain !== "Nothing" &&
      dVarPlain !== String.raw`\mathrm{Nothing}`;
    const symOp = sym ? this.nodesById[sym.id]?.op : null;
    const symAlreadyDifferential =
      symOp === "Differential" || symOp === "InexactDifferential";
    const differentialPlain = hasResolvedDifferential
      ? symAlreadyDifferential
        ? String.raw`\,${dVarPlain}`
        : String.raw`\,\mathrm{d}{${dVarPlain}}`
      : "";
    const differentialTagged = hasResolvedDifferential
      ? symAlreadyDifferential
        ? String.raw`\,${dVarTagged}`
        : String.raw`\,\mathrm{d}{${dVarTagged}}`
      : "";

    const plain = String.raw`\int${boundsPlain} ${integrandPlain}${differentialPlain}`;
    const taggedInner = String.raw`\int${boundsPlain} ${integrandTagged}${differentialTagged}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return {
      id,
      latexPlain: plain,
      latexTagged: this.wrap(id, taggedInner),
    };
  }

  private emitApply(node: MJNode, id: string, path: number[], op: string) {
    // Shape: ["Apply", fn, ...args]
    const fn = this.emit(node[1], id, [...path, 1]);
    const args = node
      .slice(2)
      .map((childNode, i) => this.emit(childNode, id, [...path, i + 2]));

    this.childrenById[id] = [fn.id, ...args.map((a) => a.id)];
    this.childIndexById[fn.id] = 0;
    args.forEach((arg, i) => (this.childIndexById[arg.id] = i + 1));

    const argsPlain = args.map((a) => a.latexPlain).join(", ");
    const argsTagged = args
      .map((a) => this.wrapFunctionArg(a.latexTagged))
      .join(", ");

    const plain = `${fn.latexPlain}\\left(${argsPlain}\\right)`;
    const taggedInner = `${fn.latexTagged}\\left(${argsTagged}\\right)`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitFunctionCall(
    node: MJNode,
    id: string,
    path: number[],
    op: string,
  ) {
    // Generic function call for known FUNCTION_OPS: [op, arg1, arg2, ...]
    if (!FUNCTION_OPS.has(op)) {
      throw Error(`${op} is not a known function`);
    }

    const args = node
      .slice(1)
      .map((childNode, i) => this.emit(childNode, id, [...path, i + 1]));

    this.childrenById[id] = args.map((a) => a.id);
    args.forEach((a, i) => (this.childIndexById[a.id] = i));

    const nameMap: Record<string, string> = {
      Sin: String.raw`\sin`,
      Cos: String.raw`\cos`,
      Tan: String.raw`\tan`,
      Arctan: String.raw`\arctan`,
      ArcTan: String.raw`\arctan`,
      Arcsin: String.raw`\arcsin`,
      ArcSin: String.raw`\arcsin`,
      Arccos: String.raw`\arccos`,
      ArcCos: String.raw`\arccos`,
      Exp: String.raw`\exp`,
      Log: String.raw`\log`,
      Ln: String.raw`\ln`,
      Abs: String.raw`\left|`,
      Sqrt: String.raw`\sqrt`,
      D: "D",
    };

    const fnLatex = nameMap[op] ?? op;
    const taggedFnLatex =
      op === "Abs" || op === "Sqrt" ? fnLatex : this.wrap(id, fnLatex);

    const argsPlain = args.map((a) => a.latexPlain).join(", ");
    const argsTagged = args.map((a) => a.latexTagged).join(", ");

    const singleIsDelimiter =
      args.length === 1 && this.nodesById[args[0].id]?.op === "Delimiter";

    const plain =
      op === "Abs"
        ? String.raw`${fnLatex}${argsPlain}\right|`
        : op === "Sqrt" && args.length === 1
          ? String.raw`${fnLatex}{${argsPlain}}`
        : singleIsDelimiter
          ? `${fnLatex}${argsPlain}`
          : `${fnLatex}\\left(${argsPlain}\\right)`;
    const taggedInner =
      op === "Abs"
        ? String.raw`${taggedFnLatex}${argsTagged}\right|`
        : op === "Sqrt" && args.length === 1
          ? String.raw`${taggedFnLatex}{${argsTagged}}`
        : singleIsDelimiter
          ? `${taggedFnLatex}${argsTagged}`
          : `${taggedFnLatex}\\left(${argsTagged}\\right)`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }


  private emitDifferential(
    node: MJNode,
    id: string,
    path: number[],
    op: string,
  ) {
    const inner = this.emit(node[1], id, [...path, 1]);

    this.childrenById[id] = [inner.id];
    this.childIndexById[inner.id] = 0;

    const innerPlain = inner.latexPlain;
    const plain = String.raw`\mathrm{d}{${innerPlain}}`;
    // Keep differential atomic for selection: no tags inside.
    const taggedInner = String.raw`\mathrm{d}{${innerPlain}}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitInexactDifferential(
    node: MJNode,
    id: string,
    path: number[],
    op: string,
  ) {
    const inner = this.emit(node[1], id, [...path, 1]);

    this.childrenById[id] = [inner.id];
    this.childIndexById[inner.id] = 0;

    const innerPlain = inner.latexPlain;
    const plain = String.raw`\mathrm{d}'{${innerPlain}}`;
    // Keep inexact differential atomic for selection: no tags inside.
    const taggedInner = plain;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitDeltaOfQuantity(
    node: MJNode,
    id: string,
    path: number[],
    op: string,
  ) {
    const inner = this.emit(node[1], id, [...path, 1]);

    this.childrenById[id] = [inner.id];
    this.childIndexById[inner.id] = 0;

    const innerPlain = inner.latexPlain;
    const plain = String.raw`\Delta ${innerPlain}`;
    // Keep DeltaOfQuantity atomic for selection: no tags inside.
    const taggedInner = String.raw`\Delta ${innerPlain}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitInverseFunction(
    node: MJNode,
    id: string,
    path: number[],
    op: string,
  ) {
    const base = this.emit(node[1], id, [...path, 1]);

    this.childrenById[id] = [base.id];
    this.childIndexById[base.id] = 0;

    const nameMap: Record<string, string> = {
      Sin: String.raw`\sin`,
      Cos: String.raw`\cos`,
      Tan: String.raw`\tan`,
      Exp: String.raw`\exp`,
      Log: String.raw`\log`,
      Ln: String.raw`\ln`,
      Abs: String.raw`\left|`,
    };

    const head = node[1];
    const fnLatex =
      typeof head === "string"
        ? (nameMap[head] ?? base.latexPlain)
        : base.latexPlain;

    const plain = `${fnLatex}^{-1}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, plain) };
  }

  private emitPartial(node: MJNode, id: string, path: number[], op: string) {
    const inner = this.emit(node[1], id, [...path, 1]);

    this.childrenById[id] = [inner.id];
    this.childIndexById[inner.id] = 0;

    const innerPlain = inner.latexPlain;
    const plain = String.raw`\partial{${innerPlain}}`;
    // Keep partial atomic for selection: no tags inside.
    const taggedInner = String.raw`\partial{${innerPlain}}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitPartialDerivative(
    node: MJNode,
    id: string,
    path: number[],
    op: string
  ) {
    const operand = node[1];
    if (operand === undefined) {
      const plain = String.raw`\partial`;
      this.childrenById[id] = [];
      this.nodesById[id] = { id, op, latex: plain, json: node };
      return { id, latexPlain: plain, latexTagged: this.wrap(id, plain) };
    }

    const normalizedOperand =
      Array.isArray(operand) && operand.length === 1
        ? (operand[0] as MJ)
        : (operand as MJ);
    const inner = this.emit(normalizedOperand, id, [...path, 1]);
    this.childrenById[id] = [inner.id];
    this.childIndexById[inner.id] = 0;

    const innerPlain = inner.latexPlain;
    const plain = String.raw`\partial ${innerPlain}`;
    // Keep as one atomic unit for selection/highlight consistency with Partial.
    const taggedInner = String.raw`\partial ${innerPlain}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  static create(mj: MJ): ExpressionTree {
    return new ExpressionTree(mj);
  }

  static exportLatex(mj: MJ): string {
    return new ExpressionTree(mj, {
      includeTrailingDifferentialThinspace: true,
    }).latexPlain;
  }

  private emitDotProduct(node: MJNode, id: string, path: number[], op: string) {
    const lhs = this.emit(node[1], id, [...path, 1]);
    const rhs = this.emit(node[2], id, [...path, 2]);

    this.childrenById[id] = [lhs.id, rhs.id];
    this.childIndexById[lhs.id] = 0;
    this.childIndexById[rhs.id] = 1;

    const sep = String.raw` \cdot `;
    const wrapIfLowPrecedence = (child: {
      id: string;
      latexPlain: string;
      latexTagged: string;
    }) => {
      const childOp = this.nodesById[child.id]?.op;
      const needsParens = childOp === "Add" || childOp === "Equal";
      if (!needsParens) {
        return child;
      }
      return {
        ...child,
        latexPlain: String.raw`\left(${child.latexPlain}\right)`,
        latexTagged: String.raw`\left(${child.latexTagged}\right)`,
      };
    };

    const lhsWrapped = wrapIfLowPrecedence(lhs);
    const rhsWrapped = wrapIfLowPrecedence(rhs);

    const plain = `${lhsWrapped.latexPlain}${sep}${rhsWrapped.latexPlain}`;
    const taggedInner = `${lhsWrapped.latexTagged}${sep}${rhsWrapped.latexTagged}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }
}

function normalizeVectors(expr: MJ): MJ {
  if (!Array.isArray(expr)) return expr;
  const op = String(expr[0]);
  const normalizedChildren = expr
    .slice(1)
    .map((child) => normalizeVectors(child));
  const newOp = op === "OverVector" ? "Vector" : op;
  return [newOp, ...normalizedChildren] as MJNode;
}
