export type MJ = string | number | MJNode;
export type MJNode = [op: string, ...args: MJ[]];

export type NodeInfo = {
  id: string;
  op: string;
  latex: string;
  json: MJ;
};

const FUNCTION_OPS = new Set(["Sin", "Cos", "Tan", "Exp", "Log", "Ln", "Abs"]);

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

  private _nextId = 1;

  private wrap(id: string, contentLatex: string) {
    return String.raw`\htmlData{node-id="${id}"}{${contentLatex}}`;
  }

  private newId(): string {
    return `n${this._nextId++}`;
  }

  private emit(
    node: MJ,
    parentId: string | null,
    path: number[]
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
          this.emitFractionDerivative(node, id, path, op)
        );
      }
      if (op === "FractionPartialDerivative") {
        return this.recordTagged(
          this.emitFractionPartialDerivative(node, id, path, op)
        );
      }
      if (op === "Integrate") {
        return this.recordTagged(this.emitIntegrate(node, id, path, op));
      }
      if (op === "Partial") {
        return this.recordTagged(this.emitPartial(node, id, path, op));
      }
      if (op === "Tuple") {
        return this.recordTagged(this.emitTuple(node, id, path, op));
      }
      if (op === "Multiply") {
        return this.recordTagged(this.emitMultiply(node, id, path, op));
      }
      if (op === "InvisibleOperator") {
        return this.recordTagged(this.emitImplicitMultiply(node, id, path, op));
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
      if (op === "OverVector") {
        return this.recordTagged(this.emitOverVector(node, id, path, op));
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
      if (op === "OverDot") {
        return this.recordTagged(this.emitOverDot(node, id, path, op));
      }
      if (FUNCTION_OPS.has(op)) {
        return this.recordTagged(this.emitFunctionCall(node, id, path, op));
      }
      throw Error(`${op} is not a known type of array`);
    }

    let plain = this._leafLatex(node);
    this.nodesById[id] = {
      id,
      op:
        typeof node === "string"
          ? "Symbol"
          : typeof node === "number"
          ? "Number"
          : "Atom",
      latex: plain,
      json: node,
    };
    if (typeof node === "string" && /^[A-Za-z]$/.test(node)) {
      const plain = node; // italic by default in math mode
      this.nodesById[id] = { id, op: "Symbol", latex: plain, json: node };
      const tagged = this.wrap(id, plain);
      return this.recordTagged({ id, latexTagged: tagged, latexPlain: plain });
    }
    const tagged = this.wrap(id, plain);
    return this.recordTagged({ id, latexPlain: plain, latexTagged: tagged });
  }

  constructor(mj: MJ) {
    this.rootJson = mj;
    this._leafLatex = (x) => String(x);
    const parseResult = this.emit(mj, null, []);
    this.latexTagged = parseResult.latexTagged;
    this.latexPlain = parseResult.latexPlain;
  }

  private recordTagged<T extends { id: string; latexTagged: string }>(
    result: T
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
    close: string
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
    op: string
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
        Exp: String.raw`\exp`,
        Log: String.raw`\log`,
        Ln: String.raw`\ln`,
        Abs: String.raw`\left|`,
      };
      const fnLatex = nameMap[funcNameRaw] ?? funcNameRaw;
      const argsPlain = args.map((a) => a.latexPlain).join(", ");
      const argsTagged = args.map((a) => a.latexTagged).join(", ");
      const singleIsDelimiter =
        args.length === 1 && this.nodesById[args[0].id]?.op === "Delimiter";
      const plain =
        funcNameRaw === "Abs"
          ? String.raw`${fnLatex}${argsPlain}\right|`
          : singleIsDelimiter
          ? `${fnLatex}${argsPlain}`
          : `${fnLatex}\\left(${argsPlain}\\right)`;
      const taggedInner =
        funcNameRaw === "Abs"
          ? String.raw`${fnLatex}${argsTagged}\right|`
          : singleIsDelimiter
          ? `${fnLatex}${argsTagged}`
          : `${fnLatex}\\left(${argsTagged}\\right)`;

      this.nodesById[id] = { id, op, latex: plain, json: node };
      return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
    }

    // Thin space for implicit multiplication
    const sep = String.raw`\,`;
    const plain = children.map((c) => c.latexPlain).join(" ");
    const taggedInner = children.map((c) => c.latexTagged).join(sep);

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitMultiply(node: MJNode, id: string, path: number[], op: string) {
    // Explicit multiplication: render like implicit multiplication (no dot).
    const children = node
      .slice(1)
      .map((c: MJ, i: number) => this.emit(c, id, [...path, 1 + i]));

    this.childrenById[id] = children.map((ch) => ch.id);
    this.childrenById[id].forEach((cid, idx) => {
      this.childIndexById[cid] = idx;
    });

    const sep = String.raw`\,`; // thin space for readability
    const plain = children.map((c) => c.latexPlain).join(" ");
    const taggedInner = children.map((c) => c.latexTagged).join(sep);

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
    op: string
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
    op: string
  ) {
    const num = this.emit(node[1], id, [...path, 1]);
    const den = this.emit(node[2], id, [...path, 2]);

    const innerPlain = (childId: string, fallback: string): string => {
      const info = this.nodesById[childId];
      if (info?.op === "Partial") {
        const innerId = this.childrenById[childId]?.[0];
        if (innerId && this.nodesById[innerId]) {
          return this.nodesById[innerId].latex;
        }
      }
      return fallback;
    };

    this.childrenById[id] = [num.id, den.id];
    this.childIndexById[num.id] = 0;
    this.childIndexById[den.id] = 1;

    const numInner = innerPlain(num.id, num.latexPlain);
    const denInner = innerPlain(den.id, den.latexPlain);

    const numPlain = String.raw`\partial{${numInner}}`;
    const denPlain = String.raw`\partial{${denInner}}`;
    // Atomic: no inner tagging
    const numTagged = String.raw`\partial{${numInner}}`;
    const denTagged = String.raw`\partial{${denInner}}`;

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

    const baseNeedsParen = this.nodesById[base.id]?.op === "Add";
    const wrap = (s: string) =>
      baseNeedsParen ? String.raw`\left(${s}\right)` : s;

    const plain = `${wrap(base.latexPlain)}^{${exp.latexPlain}}`;
    const taggedInner = `${wrap(base.latexTagged)}^{${exp.latexTagged}}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitOverVector(node: MJNode, id: string, path: number[], op: string) {
    const inner = this.emit(node[1], id, [...path, 1]);

    this.childrenById[id] = [inner.id];
    this.childIndexById[inner.id] = 0;

    const plain = String.raw`\vec{${inner.latexPlain}}`;
    const taggedInner = String.raw`\vec{${inner.latexTagged}}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitOverDot(node: MJNode, id: string, path: number[], op: string) {
    const inner = this.emit(node[1], id, [...path, 1]);

    this.childrenById[id] = [inner.id];
    this.childIndexById[inner.id] = 0;

    const count = typeof node[2] === "number" ? Number(node[2]) : 1;
    const cmd = count >= 2 ? String.raw`\ddot` : String.raw`\dot`;

    const plain = String.raw`${cmd}{${inner.latexPlain}}`;
    const taggedInner = String.raw`${cmd}{${inner.latexTagged}}`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitSubscript(node: MJNode, id: string, path: number[], op: string) {
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

    const boundsPlain =
      lower || upper
        ? `_{${lower?.latexPlain ?? ""}}^{${upper?.latexPlain ?? ""}}`
        : "";
    const dVarPlain = sym ? sym.latexPlain : "";
    const dVarTagged = sym ? sym.latexTagged : "";

    const plain = String.raw`\int${boundsPlain} ${integrand.latexPlain} \,\mathrm{d}{${dVarPlain}}`;
    const taggedInner = String.raw`\int${boundsPlain} ${integrand.latexTagged} \,\mathrm{d}{${dVarTagged}}`;

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
    const argsTagged = args.map((a) => a.latexTagged).join(", ");

    const plain = `${fn.latexPlain}\\left(${argsPlain}\\right)`;
    const taggedInner = `${fn.latexTagged}\\left(${argsTagged}\\right)`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitFunctionCall(
    node: MJNode,
    id: string,
    path: number[],
    op: string
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
      Exp: String.raw`\exp`,
      Log: String.raw`\log`,
      Ln: String.raw`\ln`,
      Abs: String.raw`\left|`,
    };

    const fnLatex = nameMap[op] ?? op;

    const argsPlain = args.map((a) => a.latexPlain).join(", ");
    const argsTagged = args.map((a) => a.latexTagged).join(", ");

    const singleIsDelimiter =
      args.length === 1 && this.nodesById[args[0].id]?.op === "Delimiter";

    const plain =
      op === "Abs"
        ? String.raw`${fnLatex}${argsPlain}\right|`
        : singleIsDelimiter
        ? `${fnLatex}${argsPlain}`
        : `${fnLatex}\\left(${argsPlain}\\right)`;
    const taggedInner =
      op === "Abs"
        ? String.raw`${fnLatex}${argsTagged}\right|`
        : singleIsDelimiter
        ? `${fnLatex}${argsTagged}`
        : `${fnLatex}\\left(${argsTagged}\\right)`;

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  private emitDifferential(
    node: MJNode,
    id: string,
    path: number[],
    op: string
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

  static create(mj: MJ): ExpressionTree {
    return new ExpressionTree(mj);
  }
}
