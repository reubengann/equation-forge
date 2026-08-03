# Core concepts

Equation Forge treats mathematics as a structured expression rather than a
string of characters. Direct manipulation works by rewriting that structure.

## The equation pad

A pad is a document containing equation rows. Each row stores:

- its current LaTeX;
- its edit history;
- its additive or multiplicative move mode;
- information about symbols that should be interpreted as functions.

Only one row is active at a time. Toolbar actions and keyboard shortcuts apply
to that row. In the standalone application the pad is persisted in browser
storage; an embedding host such as JupyterLab can provide a different
persistence mechanism.

## Edit mode and display mode

Use **edit mode** to enter LaTeX through the MathLive editor. Use **display
mode** to select, drag, and rewrite the compiled expression.

Accepting an edit parses the input into an abstract syntax tree (AST). The AST
records relationships such as "term in a sum", "factor in a product",
"numerator", and "right-hand side of a relation." Rewrite rules use these
relationships to determine valid moves.

## Selection

Click an expression in display mode to select a structural node. Depending on
the expression, a selection might be a symbol, term, factor, sum, fraction,
function call, derivative, or another supported construct.

Drag a marquee over adjacent terms or factors to make a multi-selection.
Multi-selection is intentionally constrained: selected nodes must form a
meaningful structural group, and not every rewrite supports multiple nodes.

The visible selection is also the source of a drag. A destination preview
appears only when Equation Forge has a valid rewrite for the selection,
destination, and current move mode.

## Additive and multiplicative moves

Moving an expression is ambiguous unless its algebraic role is known. Equation
Forge therefore exposes two move modes.

### Additive mode

Use additive mode for terms in a sum. Moving a term across a relation applies
its additive inverse:

$$
x+a=b \quad\longrightarrow\quad x=b-a
$$

It also supports rearranging and inserting terms in sums where the structure
permits it.

### Multiplicative mode

Use multiplicative mode for factors in a product or fraction. Moving a factor
across a relation applies its multiplicative inverse:

$$
ax=b \quad\longrightarrow\quad x=\frac{b}{a}
$$

The explicit choice matters for an equation such as \(x=y\). Dragging \(x\) to
the right could reasonably mean either:

$$
0=y-x
$$

or:

$$
1=\frac{y}{x}
$$

Equation Forge does not guess which derivation you intend.

## Rewrites

A rewrite replaces a selected part of the AST with an equivalent expression.
There are three main kinds:

1. **Drag rewrites** rearrange, extract, pivot, or insert terms and factors.
2. **Automatic rewrites** find an applicable factor, distribution, cleanup,
   evaluation, or identity operation for the selection.
3. **Parameterized rewrites** ask for more information, as substitution,
   force factor, and apply operation do.

Some identities require mathematical assumptions, such as positivity or
particular branch choices. Equation Forge displays known caveats when offering
those identities; it is still the user's responsibility to check that an
identity is valid in the problem's domain.

## Grouping and parentheses

Rendered parentheses describe grouping in the expression tree. Equation Forge
may insert them when a rewrite places a sum or negated expression inside a
product, power, fraction, or function argument. Removing required parentheses
would change the meaning of the formula.

Use **Toggle delimiters** or **Cycle delimiter** when those actions are
available for the selected group.

## Parsing and immutable expressions

Equation Forge supports common arithmetic, relations, powers, fractions,
functions, vectors, sums and products, limits, integrals, differentials, and
derivatives. Support is not universal.

Unrecognized LaTeX is generally retained as an `immutable_expression`. It can
round-trip back to LaTeX, but its internal parts cannot participate in normal
structural rewrites. A multi-line environment is treated as expression input,
not as a complete equation pad; only its first meaningful cell is compiled.
