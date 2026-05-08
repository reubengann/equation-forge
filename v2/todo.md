- Be able to convert Expr to mathjson for CE (unless there's another engine that would be better)
  - For cortex, we might want to do a symbol substitution when we stick it into the the engine,
    and translate back when we get an answer out. Then we don't have to worry about how it will handle
    things like mathscr, integrals, etc.
- Determine which elements are selectable (atomic). For instance `x'` is atomic, even though it's represented in
  expr as (prime -> symbol). The symbol should not be selectable separately. Then make the selectionController respect this
- Implement way selection multiple terms (multi-click, ctrl-click, rubber-band)
- Provide a way to force a thinspace in mathlive?
- Is there a way to represent function in latex? Maybe some invisible character? Otherwise, we can never
  round-trip these.
- Accept on enter
- BIG: Implement rules engine for determining move validity, insertion point, and tree rewriting.

a + b to b + a
a - b to -b + a
a + b = c to b = c - a
a - b = c to a = c + b
a - b = c to -b = -a + c
