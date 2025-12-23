export type MJ = string | number | MJNode;
export type MJNode = [op: string, ...args: MJ[]];

export type NodeInfo = {
  id: string;
  op: string;
  latex: string;
  json: MJ;
};

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
        return this.emitAdd(node, id, path, op);
      }
      if (op === "Equal") {
        return this.emitEqual(node, id, path, op);
      }
      if (op == "Divide") {
        return this.emitDivide(node, id, path, op);
      }
      if (op === "InvisibleOperator") {
        return this.emitImplicitMultiply(node, id, path, op);
      }
      if (op == "Negate") {
        return this.emitNegate(node, id, path, op);
      }
      if (op === "Delimiter")
        return this.emitGroup(node, id, path, op, "(", ")");
      if (op === "List") return this.emitGroup(node, id, path, op, "[", "]");
      if (op === "Set") return this.emitGroup(node, id, path, op, "{", "}");

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
      return { id, latexTagged: this.wrap(id, plain), latexPlain: plain };
    }
    return { id, latexPlain: plain, latexTagged: this.wrap(id, plain) };
  }

  constructor(mj: MJ) {
    this.rootJson = mj;
    this._leafLatex = (x) => String(x);
    const parseResult = this.emit(mj, null, []);
    this.latexTagged = parseResult.latexTagged;
    this.latexPlain = parseResult.latexPlain;
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
    const plain = `-${inner.latexPlain}`;
    const taggedInner = `-${inner.latexTagged}`;

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

    // Thin space for implicit multiplication
    const sep = String.raw`\,`;
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

        const innerTaggedLatex = innerEmitted
          ? innerEmitted.latexTagged
          : this.wrap(innerId, innerPlain);

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

  static create(mj: MJ): ExpressionTree {
    return new ExpressionTree(mj);
  }
}
