# Your first derivation

This tutorial rearranges

$$
a x + b = c
$$

to isolate \(x\). It demonstrates both move modes.

## 1. Enter the equation

1. Create or activate an equation row.
2. Open the row for editing.
3. Enter `a x + b = c`.
4. Accept the edit to return to display mode.

Equation Forge can now select the terms and factors in the expression.

## 2. Move an additive term

Make sure ![Additive move
mode](assets/icons/additive-move-mode.svg) **Additive move mode** is active in
the toolbar. Select \(b\) by clicking it, then drag it to the right-hand side
of the equation. Notice that a small vertical line appears where the selected
expression can be dropped. This is the insertion preview. Releasing the mouse
button commits the movement. The result is:

$$
a x = c - b
$$

This is a structural rewrite. Moving \(b\) across the equality is equivalent
to subtracting \(b\) from both sides.

If no insertion preview appears, the selected expression cannot be moved to
the current destination in the active move mode. Try dropping on the
right-hand expression itself rather than outside the equation.

## 3. Move a multiplicative factor

Switch to ![Multiplicative move
mode](assets/icons/multiplicative-move-mode.svg) **Multiplicative move mode**.
Select the factor \(a\), then drag it to the right-hand side.

The result is:

$$
x = \frac{c-b}{a}
$$

In multiplicative mode, moving \(a\) across the equality is equivalent to
dividing both sides by \(a\).

## 4. Review and copy the derivation

Use ![Undo](assets/icons/undo.svg) **Undo** and
![Redo](assets/icons/redo.svg) **Redo** to move through the row's history. The
copy controls can copy:

- ![Copy equation](assets/icons/copy.svg) the current equation as LaTeX;
- ![Copy selection](assets/icons/copy.svg) the selected expression as LaTeX;
- ![Copy equation history](assets/icons/copy-history.svg) the complete equation
  history as LaTeX.

The standalone application keeps the row history with the saved pad state.

## 5. Try a rewrite action

Enter another expression such as

$$
x(y+z)
$$

Select the whole product in either of these ways:

- Double-click \(x\). Double-clicking a term selects its enclosing expression;
  \(x\) is the easiest target here because you do not have to click directly
  on a parenthesis.
- Marquee-drag around the complete expression.

With the product selected, click
![Distribute selection](assets/icons/distribute-selection.svg)
in the toolbar (the **Distribute selection** button), or press <kbd>D</kbd>.
Hover over a toolbar icon to see its name. The result is:

$$
xy+xz
$$

Then select the resulting sum (again by double-clicking one of its terms or
marquee-dragging around it) and click
![Factor selection](assets/icons/factor-selection.svg)
in the toolbar (the **Factor selection** button), or press <kbd>F</kbd>, to
factor it again.

## What to notice

- A selection represents a structural part of the expression, not a range of
  rendered characters.
- Move mode changes the algebraic meaning of a drag.
- A highlighted insertion preview indicates a valid destination.
- Toolbar buttons are enabled only when their rewrite applies to the current
  selection.
- Equation Forge does not automatically perform every possible
  simplification. Use
  ![Clean up selection](assets/icons/clean-up-selection.svg) **Clean up
  selection** when a supported simplification is available.

Continue with [Core concepts](concepts.md) for a more detailed explanation.
