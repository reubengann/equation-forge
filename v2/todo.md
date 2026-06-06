- (a+b)(c) How should force negation work on (c)? Right now we disallow it.
- Force negation on a square term (b - a)^2 should just be (-b + a)^2, not -(-b + a)^2.
- Full-container multi-selections: if ctrl-click/marquee selects every direct child of an add/product,
  should that become parent-equivalent or a parent node selection? Need to define demotion behavior for
  deselecting a child afterward, e.g. ctrl-clicking `a` while `(a+b)c` is selected as a product.
- Provide a way to force a thinspace in mathlive? Do we want that?
- Is there a way to represent function in latex? Maybe some invisible character? Otherwise, we can never
  round-trip these.
- Not sure about something like \frac{a b c}{e b a}. Should we be able to cancel only a? Right now we don't allow the multi-selection via ctrl click of just the a terms at all.
  What if someone wants to leave one common factor but not another? I guess this is probably rare.
- Apply modal should give an option to switch the inequality symbol
- vector operations
- Force factor: Say we have `-v v_0 + \frac{1}{2} v^{2} + \frac{1}{2} v_0^{2}`. It would be nice to say "look,
  I know you don't see a factor of 1/2 in every term, but I want you to pull one out anyway" so that we get
  `- 2 v v_0 + v^{2} + v_0^{2}`. Maybe run cleanup on each term separately too.
- Check whether a product keeps the sign or whether it stays on the terms. Really, if we multiply two terms
  `-a` and `b`, which is symbol(a, sign: -1) and symbol(b, sign: +1), we should probably just form
  product([symbol(a, sign: +1), symbol(b, sign: +1)], sign: -1). But right now I'm not sure that's how it works.
- If we're already treating subtraction as negative terms in sums, what is the rationale behind keeping
  divide separate from multiply? Maybe it should just have a property inverted: true/false.
