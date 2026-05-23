- Force negation on a square term (b - a)^2 should just be (-b + a)^2, not -(-b + a)^2
- Rubber-band selection
- Provide a way to force a thinspace in mathlive? Do we want that?
- Is there a way to represent function in latex? Maybe some invisible character? Otherwise, we can never
  round-trip these.
- Be able to convert Expr to mathjson for CE (unless there's another engine that would be better)
  - For cortex, we might want to do a symbol substitution when we stick it into the the engine,
    and translate back when we get an answer out. Then we don't have to worry about how it will handle
    things like mathscr, integrals, etc. This enables full CE rewrites
