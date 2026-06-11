## Low

## Medium

- Check whether a product keeps the sign or whether it stays on the terms. Really, if we multiply two terms `-a` and `b`, which is symbol(a, sign: -1) and symbol(b, sign: +1), we should probably just form product([symbol(a, sign: +1), symbol(b, sign: +1)], sign: -1). But right now I'm not sure that's how it works.
- It might be nice to be able to easily toggle `1/x` to `x^{-1}`, or `1/p^2` to `p^{-2}`, etc. This would need its own button, I reckon. This should only work for fractions of a single symbol-like object (meaning it should work with `\mathscr{H}^{-1}` but not something like `\frac{1}{a b}`). However, an obvious exception is `1/\sin x` which is often written as `\sin^{-1} x`. I guess for trigonometric functions we should still allow it. `\exp` does not have this property/convention, nor any other `call` I can think of.
- Algebrite frequently produces factors of, e.g. `x^{-2}` when evaluating, which should probably just be converted to fractions. Example:
  `\frac{\mathrm{d}}{\mathrm{d}{x}} \left(\frac{1}{x}\right)` produces `-x^{-2}`, but we should probably have it just convert to `-\frac{1}{x^{2}}`, as that's usually what's desired.
- When we have parse weirdness, I frequently get $unexpected$ in the output. Would be much better if that resulted in an error that described why that was happening.

## Hard/Uncertain

- (a+b)(c) How should force negation work on (c)? Right now we disallow it.
- Full-container multi-selections: if we ctrl-click/marquee every direct child of an add/product, should that selection be promoted to the selection of the parent? But then what would happen if we ctrl+click deselect something? We would have to define demotion behavior, e.g. ctrl-clicking `a` while `(a+b)c` is selected as a product.
- Is there a way to represent function in latex? Maybe some invisible character? Otherwise, we can never round-trip these. We don't want (f(x))^2 to be seen as f^2 x^2. Also not super sure how algebrite handles this.
- vector operations? Also it would be nice to have vectors show as bold, so `\mathbf{a}` is synonymous with `\vec{a}` I guess? idk. Probably would be better to just inject rendering of vectors as bold face.
- If we're already treating subtraction as negative terms in sums, what is the rationale behind keeping divide separate from multiply? Why wouldn't it just be a property inverted: true/false of multiply? Ultimately, whether we treat negate/divide as their own nodes really comes down to whether it makes the code simpler or not. It seemed like making negation a property of terms would make the code simpler; I'm not sure that was totally successful.
- How far do we want to take the system's understanding of things? If I have `F = U - T S` and I do d\eqn, should it comprehend
  that means `dF = d(U - T S) = dU - T dS - S dT`? The same with derivatives? What action would we even take to expand `d` across a sum? It would have to make assumptions about what is variable, or we would have to define it somehow. Same with derivatives. Right now, it has no idea; if `d\eqn` is entered, we don't even get `d(U - T S)`, we get the incorrect `dU - T S`.
