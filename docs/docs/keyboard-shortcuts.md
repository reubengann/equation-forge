# Keyboard shortcuts

Most shortcuts operate on the active equation row. Click a row to make it
active. Rewrite shortcuts run only when their action applies to the current
equation or selection.

On macOS, use <kbd>Cmd</kbd> wherever this page shows <kbd>Ctrl</kbd>.

## Editing and move mode

- <kbd>E</kbd>: edit the active equation.
- <kbd>Enter</kbd>: accept an equation or expression while editing.
- <kbd>A</kbd>: switch between additive and multiplicative move modes.

## Rewrites

- <kbd>S</kbd>: open **Substitute**.
- <kbd>F</kbd>: factor the selection.
- <kbd>D</kbd>: distribute the selection.
- <kbd>C</kbd>: clean up the selection.
- <kbd>T</kbd>: apply the highest-priority applicable identity.
- <kbd>N</kbd>: toggle negation.
- <kbd>P</kbd>: toggle delimiters.

To choose a particular identity instead of applying the default one, use the
**Choose identity** toolbar menu.

## History and copying

- <kbd>Ctrl</kbd>+<kbd>Z</kbd>: undo the last derivation step.
- <kbd>Ctrl</kbd>+<kbd>Y</kbd>: redo the last undone step.
- <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>: redo the last undone step.
- <kbd>Ctrl</kbd>+<kbd>C</kbd>: copy the active equation as LaTeX.
- <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>: copy the selection as LaTeX.

## Equation-entry macros

While entering an equation or expression, the shortcuts <kbd>Ctrl</kbd>+<kbd>1</kbd> through <kbd>Ctrl</kbd>+<kbd>9</kbd> insert the corresponding template displayed above. In the **Apply operation** dialog, <kbd>Ctrl</kbd>+<kbd>1</kbd> inserts the required `eqn` or `part` placeholder.

## Dialogs and menus

- <kbd>Escape</kbd>: close the current dialog or the open identity menu.
- <kbd>Enter</kbd>: accept an expression entered in a dialog.

## Selection modifier

<kbd>Ctrl</kbd>+click adds or removes an expression from a multi-selection.
This is useful when the expressions cannot be selected together with a
double-click or marquee selection.

## Math-field navigation

Equation entry uses MathLive. Its standard editing keys remain available,
including:

- arrow keys to move through the expression;
- <kbd>Shift</kbd>+arrow keys to extend the selection;
- <kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd> to move between
  placeholders;
- <kbd>Backspace</kbd> and <kbd>Delete</kbd> to remove content;
- <kbd>^</kbd> and <kbd>\_</kbd> to enter superscripts and subscripts.

These MathLive editing keys apply only while the cursor is inside a math
field. The single-letter rewrite shortcuts apply in display mode.
