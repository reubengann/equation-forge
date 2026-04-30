- Be able to convert Expr to mathjson for CE (unless there's another engine that would be better)
- Hook up parsing to the front-end
- Determine which elements are selectable (atomic). For instance `x'` is atomic, even though it's represented in
  expr as (prime -> symbol). The symbol should not be selectable separately. Then make the selectionController respect this
- Implement way selection multiple terms (multi-click, ctrl-click, rubber-band)
- BIG: Implement rules engine for determining move validity, insertion point, and tree rewriting.
