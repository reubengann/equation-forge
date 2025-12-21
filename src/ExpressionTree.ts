export type MJ = string | number | MJNode;
export type MJNode = [op: string, ...args: MJ[]];

export type NodeInfo = {
  id: string;
  op: string;
  latex: string;
  json: MJ;
};

export class ExpressionTree {
  readonly latexTagged: string;
  readonly nodesById: Record<string, NodeInfo> = {};
  readonly parentById: Record<string, string | null> = {};
  readonly childrenById: Record<string, string[]> = {};
  readonly childIndexById: Record<string, number> = {};
  readonly pathById: Record<string, number[]> = {};
  readonly idByPath: Record<string, string> = {};

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
    this._leafLatex = (x) => String(x);
    const parseResult = this.emit(mj, null, []);
    this.latexTagged = parseResult.latexTagged;
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
      .map((c, i) => this.emit(c, id, [...path, 1 + i]));
    this.childrenById[id] = children.map((ch) => ch.id);
    this.childrenById[id].forEach((cid, idx) => {
      this.childIndexById[cid] = idx;
    });

    const plain = children.map((c) => c.latexPlain).join(" + ");
    const taggedInner = children
      .map((c) => c.latexTagged)
      .join(String.raw` + `);

    this.nodesById[id] = { id, op, latex: plain, json: node };
    return { id, latexPlain: plain, latexTagged: this.wrap(id, taggedInner) };
  }

  static create(mj: MJ): ExpressionTree {
    return new ExpressionTree(mj);
  }
}
