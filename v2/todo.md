- (a+b)(c) How should force negation work on (c)? Right now we disallow it.
- Force negation on a square term (b - a)^2 should just be (-b + a)^2, not -(-b + a)^2.
- Rubber-band selection
- Provide a way to force a thinspace in mathlive? Do we want that?
- Is there a way to represent function in latex? Maybe some invisible character? Otherwise, we can never
  round-trip these.
- Be able to convert Expr to mathjson for CE (unless there's another engine that would be better)
  - For cortex, we might want to do a symbol substitution when we stick it into the the engine,
    and translate back when we get an answer out. Then we don't have to worry about how it will handle
    things like mathscr, integrals, etc. This enables full CE rewrites
- Not sure about something like \frac{a b c}{e b a}. Should we be able to cancel only a? Right now we don't allow the multi-selection via ctrl click of just the a terms at all.
  What if someone wants to leave one common factor but not another? I guess this is probably rare.
- Apply modal should give an option to switch the inequality symbol
- Application of identities via a submenu or something? Transforms:
  - ln a + ln b -> ln (a b)
  - sin (\pi/2 - \theta) -> \cos \theta
  - e^{x+y} -> e^x e^y
  - (a^b)^c -> a^{b c}
  - etc.
    How would it work? Would we check every identity when selected, and apply the first found? What about more complicated identities like sin^2 x + \cos^2 x = 1?
    Do we apply identities assuming quantities are positive, or meet other criteria like principle branch? Some are pretty one-way, like (a^b)^c = a^{b c}. It's clear how we
    encode from the left to the right; not so much the other way. Or $\cos \theta$. But some have clear two-way operations, like $ ln a + ln b -> ln (a b) $
- vector operations
