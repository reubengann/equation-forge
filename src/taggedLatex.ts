export type TaggedNode = {
  id: string;
  latex: string;
};

export type TaggedLatexResult = {
  plainLatex: string;
  taggedLatex: string;
  nodes: TaggedNode[];
};

const UNWRAPPED_TOKENS = new Set(["=", "+", "-", "*", "/", "(", ")"]);

function escapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function wrapNode(nodeId: string, latex: string): string {
  return String.raw`\htmlData{node-id="${escapeAttr(nodeId)}"}{${latex}}`;
}

/**
 * Minimal v1-style node tagging:
 * - Keeps whitespace/operators in place
 * - Wraps each non-whitespace piece with a stable node id
 */
export function buildTaggedLatex(latex: string): TaggedLatexResult {
  const parts = latex.split(/(\s+|[=+\-*/()])/g);
  const nodes: TaggedNode[] = [];
  let index = 1;

  const taggedLatex = parts
    .map((part) => {
      if (part.length === 0) return "";
      if (/^\s+$/.test(part)) return part;
      if (UNWRAPPED_TOKENS.has(part)) return part;
      const id = `n${index++}`;
      nodes.push({ id, latex: part });
      return wrapNode(id, part);
    })
    .join("");

  return {
    plainLatex: latex,
    taggedLatex,
    nodes,
  };
}

