# Selection and rearranging

This tutorial shows how to select expression structure, move several factors
as one term, and rearrange terms without changing their signs.

**Prerequisite:** complete [Your first derivation](../tutorial.md).

## Select one expression

Enter:

$$
ax+b=c
$$

In display mode:

- click \(b\) to select that symbol;
- double-click \(a\) or \(x\) to select the enclosing product \(ax\);
- click empty space to clear the selection.

A selection follows the expression tree. Double-clicking expands from a small
node to a meaningful enclosing expression; it does not select a range of
rendered characters.

## Select several factors with a marquee

To move \(ax\) as one additive term:

1. Make sure ![Additive move
   mode](../assets/icons/additive-move-mode.svg) **Additive move mode** is
   active.
2. Press in empty space near \(a\), then marquee-drag across both \(a\) and
   \(x\).
3. Confirm that the complete product \(ax\) is highlighted.
4. Drag the selection to the right-hand side and release at the insertion
   preview.

The result is:

$$
b=c-ax
$$

![Marquee-select and move a product](../assets/animations/multiselect_basic.gif)

The marquee creates a structural multi-selection. Equation Forge accepts it
only when the enclosed nodes form a supported group, such as adjacent factors
or terms.

## Rearrange terms in place

Enter:

$$
x(y+z)
$$

Keep additive mode active, select \(y\), and drag it to the position after
\(z\). Release when the insertion preview appears:

$$
x(y+z)\longrightarrow x(z+y)
$$

![Rearrange terms inside a sum](../assets/animations/rearrange_sum.gif)

This move changes order but does not move a term across a relation, so the sign
of \(y\) does not change.

## What to notice

- Clicking selects a node; double-clicking selects an enclosing expression.
- A marquee can select adjacent structural parts as one source.
- The insertion preview shows both whether a drop is valid and where the
  selection will be inserted.
- Rearranging within a sum differs from moving a term across an equality.

Read [Selection](../concepts.md#selection) for the underlying model or continue
to [Distribute and factor](distribute-and-factor.md).
