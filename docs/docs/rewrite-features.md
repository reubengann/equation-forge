# Rewrite features

Toolbar buttons are enabled only when an operation applies to the current
equation or selection. If a button is disabled, change the selection or use a
different expression. The icons below match the toolbar; hover over a toolbar
button to see its name.

## Drag-and-drop moves

Drag rewrites preserve the structure of the expression while moving selected
terms or factors.

Supported move families include:

- rearranging terms within a sum;
- rearranging factors within a product;
- extracting a term or factor from a containing expression;
- moving a term or factor across a relation;
- inserting a term into a sum;
- inserting a factor into a product or denominator;
- moving a factor from one power or radical into another with the same
  exponent or root degree;
- structural moves involving supported derivatives, differentials, and
  integrals.

For example, in multiplicative move mode, dragging \(a\) from \(a^3\) into
\((b+c)^3\) produces \((a(b+c))^3\). Likewise, dragging \(x\) from
\(\sqrt{x}\) into \(\sqrt{y}\) produces \(\sqrt{xy}\). These same-power moves
are branch/domain-sensitive and are generally safe for positive real bases;
Equation Forge does not verify those preconditions.

Choose ![Additive move mode](assets/icons/additive-move-mode.svg) **Additive
move mode** for terms and
![Multiplicative move mode](assets/icons/multiplicative-move-mode.svg)
**Multiplicative move mode** for factors. Press <kbd>A</kbd> to toggle between
the modes.

Not every mathematically imaginable drag has a rewrite rule. A valid drop
location shows an insertion preview. No preview means the move will not be
applied.

Try it: [Selection and rearranging](tutorials/selection-and-rearranging.md).

## History and copying

**Undo** and **Redo** navigate the active row's derivation history.

- ![Undo](assets/icons/undo.svg) Undo: <kbd>Ctrl</kbd>+<kbd>Z</kbd>
- ![Redo](assets/icons/redo.svg) Redo: <kbd>Ctrl</kbd>+<kbd>Y</kbd> or
  <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>
- ![Copy](assets/icons/copy.svg) Copy equation LaTeX:
  <kbd>Ctrl</kbd>+<kbd>C</kbd>
- ![Copy](assets/icons/copy.svg) Copy selection LaTeX:
  <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>

On macOS, use <kbd>Cmd</kbd> in place of <kbd>Ctrl</kbd>.

The toolbar also provides ![Copy equation
history](assets/icons/copy-history.svg) **Copy equation history**, which copies
the complete derivation rather than only its current line.

## Relation and substitution actions

### Flip relation

Toolbar icon: ![Flip relation](assets/icons/flip-relation.svg)

Swaps the sides of an equality or inequality. For an inequality, the
comparison operator is reversed as required:

$$
x<y \quad\longrightarrow\quad y>x
$$

### Substitute

Toolbar icon: ![Substitute](assets/icons/substitute.svg)

Replaces the selected expression using another relation in the pad or a
replacement entered in the substitution dialog. Press <kbd>S</kbd> to open the
action when it is available.

![Substitute all matching
expressions](assets/icons/substitute-all.svg) **Substitute all matching
expressions** applies the same replacement to every matching occurrence.
Review the result carefully when the same symbol has different meanings in
different parts of a formula.

Try it: [Substitution](tutorials/substitution.md).

### Apply operation

Toolbar icon: ![Apply operation](assets/icons/apply-operation.svg)

Applies a user-entered operation to both sides of a relation, or to the
numerator and denominator of a selected fraction. Templates use `\eqn` for the
relation and `\part` for the selected fraction part.

When applying an order-reversing operation to an inequality, use the dialog's
inequality-flip option as appropriate. Equation Forge does not infer all
domain or monotonicity conditions.

Try it: [Operations, identities, and
evaluation](tutorials/operations-identities-and-evaluation.md#apply-an-operation-to-both-sides).

## Automatic rewrites

### Factor selection

Toolbar icon: ![Factor selection](assets/icons/factor-selection.svg)

Factors a selected expression when Equation Forge recognizes a supported
common factor, common denominator, or perfect-square pattern. Shortcut:
<kbd>F</kbd>.

### Force factor selection

Toolbar icon: ![Force factor selection](assets/icons/force-factor-selection.svg)

Factors a selected expression by a nonzero, simple rational factor supplied by
the user. This action is useful when the automatic factor rewrite does not
choose the intended factor.

### Distribute selection

Toolbar icon: ![Distribute selection](assets/icons/distribute-selection.svg)

Distributes a product over a sum, or applies another supported distribution
rule such as a derivative over a sum. Shortcut: <kbd>D</kbd>.

Try it: [Distribute and factor](tutorials/distribute-and-factor.md).

### Clean up selection

Toolbar icon: ![Clean up selection](assets/icons/clean-up-selection.svg)

Performs supported local numeric, rational, and structural simplifications.
Cleanup is deliberately explicit; a drag does not trigger every possible
simplification. Shortcut: <kbd>C</kbd>.

### Evaluate selection

Toolbar icon: ![Evaluate selection](assets/icons/evaluate-selection.svg)

Sends a supported selected expression through the bundled Algebrite adapter.
Evaluation is available only for expression forms that can be translated to
that backend.

Try it: [Evaluate a supported
integral](tutorials/operations-identities-and-evaluation.md#evaluate-a-supported-integral).

## Identities

![Apply identity](assets/icons/apply-identity.svg) **Apply identity** chooses a
default applicable identity for the selection. Press <kbd>T</kbd> to apply it.
The adjacent ![Choose identity](assets/icons/choose-identity.svg) identity menu
lets you choose a specific rewrite when several are available.

The identity library includes supported rules for:

- powers, exponentials, and logarithms;
- trigonometric identities;
- derivative, differential, and integral sums;
- product, quotient, and chain rules.

Some identities have domain or branch caveats. These appear alongside the
identity choice and should be treated as mathematical preconditions, not as
warnings that Equation Forge can verify automatically.

Try it: [Apply a named
identity](tutorials/operations-identities-and-evaluation.md#apply-a-named-identity).

## Structure controls

### Toggle negation

Toolbar icon: ![Toggle negation](assets/icons/toggle-negation.svg)

Adds, removes, or restructures a negation where supported. Shortcut:
<kbd>N</kbd>.

### Toggle function symbol

Toolbar icon: ![Toggle function symbol](assets/icons/toggle-function-symbol.svg)

Marks a selected symbol as a function symbol, or removes that designation.
This resolves ambiguous implicit notation such as \(f(x)\), where juxtaposition
could otherwise be interpreted as multiplication.

### Toggle delimiters

Toolbar icon: ![Toggle delimiters](assets/icons/toggle-delimiters.svg)

Adds or removes visible grouping delimiters when doing so preserves the
expression's structure. Shortcut: <kbd>P</kbd>.

### Cycle delimiter

Toolbar icon: ![Cycle delimiter](assets/icons/cycle-delimiter.svg)

Changes the delimiter style of a supported selected group or function call.

## Editing

Press <kbd>E</kbd> to edit the active display row. Accept the MathLive entry to
compile it and return to direct-manipulation mode.
