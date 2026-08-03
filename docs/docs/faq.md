# Frequently asked questions

## Why are there additive and multiplicative move modes?

Many moves are ambiguous. Consider:

$$
x=y
$$

If you drag \(x\) to the other side, should the result be:

$$
0=y-x
$$

or:

$$
1=\frac{y}{x}
$$

Both are valid derivations. Additive mode chooses the first interpretation;
multiplicative mode chooses the second. Equation Forge asks you to choose
instead of guessing your intent. Press <kbd>A</kbd> to switch modes.

## Why can't I enter this expression?

Equation Forge accepts input through MathLive, then parses its LaTeX into a
structured expression. Its parser supports many common arithmetic, relation,
calculus, vector, and function constructs, but not arbitrary LaTeX.

Unsupported input is usually preserved as an immutable expression. You can
still edit or copy it, but Equation Forge cannot select or rewrite its internal
parts. Some malformed or explicitly unsupported input may instead be marked
invalid.

Try simplifying custom macros, avoiding layout-only LaTeX, or entering a
single expression rather than a multi-line environment.

## Why can't I select or drag this?

A drag is available only when Equation Forge has a rewrite rule for all three
of these:

1. the structural selection;
2. the destination;
3. the active additive or multiplicative move mode.

No insertion preview means no valid move was found. Check the move mode, try a
more specific selection, or drop directly on the intended term or factor.

Some moves are intentionally rejected because they are unhelpful or
ill-defined, such as moving a bare zero additively or a lone one
multiplicatively. Multi-selections must also form a supported structural group.

## Why did Equation Forge insert parentheses?

Parentheses preserve grouping after a rewrite. For example, placing a sum
inside a product requires delimiters:

$$
a(b+c)
$$

Without the parentheses, \(ab+c\) would be a different expression. Equation
Forge adds required grouping rather than preserving the visual form at the
expense of mathematical meaning.

For optional display groups, use **Toggle delimiters** or **Cycle delimiter**
when those actions are enabled.

## Why didn't the result simplify automatically?

Equation Forge separates structural moves from simplification. This makes each
derivation step explicit and avoids silently performing more algebra than the
requested move.

Select the expression and choose **Clean up selection** (or press
<kbd>C</kbd>) for a supported local simplification. **Evaluate selection** may
perform a broader backend-assisted evaluation for compatible expressions.
Neither action is a universal computer algebra simplifier.

## Why is a toolbar action disabled?

Most actions depend on the current structural selection. For example,
**Distribute** requires a supported product-over-sum pattern, and **Factor**
requires a pattern the factor engine recognizes.

Click the smallest complete expression that represents the operation's input.
If the action remains disabled, that form is not currently supported.

## Does Equation Forge check assumptions?

Not completely. Some identities depend on conditions such as positive
arguments, nonzero denominators, real-valued variables, or branch choices.
Equation Forge displays known caveats for identity rewrites but does not prove
that all assumptions hold. Check them in the context of your derivation.

## Where are equations saved?

The standalone application stores its pad in browser local storage. A host
application controls persistence when embedding `@equation-forge/ui`; the
JupyterLab extension uses JupyterLab's file-oriented workflow.

## Can I use Equation Forge as a library?

Yes. `@equation-forge/core` provides headless AST, LaTeX, SymPy, compilation,
selection, and rewrite APIs. `@equation-forge/ui` provides the controlled React
pad and serialization helpers. The packages are currently early-stage, so
integrators should expect the API to evolve.

## Can I add my own macros?

## Why doesn't this support `/` division notation as well as fractions?

This project depends on Mathlive, and Mathlive does not support mixing slash and fractions at the same time. The `/` key always makes something a fraction.
