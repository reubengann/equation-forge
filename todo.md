## Low

- Page-level option to copy full equations with $$ $$ around them (persist)

## Medium

## Hard/Uncertain

- Check whether a product keeps the sign or whether it stays on the terms. Really, if we multiply two terms `-a` and `b`, which is symbol(a, sign: -1) and symbol(b, sign: +1), we should probably just form product([symbol(a, sign: +1), symbol(b, sign: +1)], sign: -1). But right now I'm not sure that's how it works. Ultimately, we should keep negate and divide if it makes the code simpler, and get rid of them if it makes it more complicated. We axed negate in favor of the sign property because some things looked easier to do ... not sure if that's still the case.
- Full-container multi-selections: if we ctrl-click/marquee every direct child of an add/product, should that selection be promoted to the selection of the parent? But then what would happen if we ctrl+click deselect something? We would have to define demotion behavior, e.g. ctrl-clicking `a` while `(a+b)c` is selected as a product.
- Is there a way to represent function in latex? Maybe some invisible character? Otherwise, we can never round-trip these. We don't want (f(x))^2 to be seen as f^2 x^2. Also not super sure how algebrite handles this.
- vector operations? We likely don't have any identities surrounding cross or dot products, nor do we do any kind of checks whether a given equation makes dimensional sense (so, e.g., you can do `\eqn + 5` to `\vec{a} = \vec{v} \times \vec{w}`, which is nonsense, but there's nothing to stop you from writing it I think.) This would also presumably require logic at the parsing level, since inputting an invalid equation also breaks comprehension.
- If we're already treating subtraction as negative terms in sums, what is the rationale behind keeping divide separate from multiply? Why wouldn't it just be a property inverted: true/false of multiply? Ultimately, whether we treat negate/divide as their own nodes really comes down to whether it makes the code simpler or not. It seemed like making negation a property of terms would make the code simpler; I'm not sure that was totally successful.
- How far do we want to take the system's understanding of things? If I have `F = U - T S` and I do d\eqn, should it comprehend
  that means `dF = d(U - T S) = dU - T dS - S dT`? The same with derivatives? What action would we even take to expand `d` across a sum? It would have to make assumptions about what is variable, or we would have to define it somehow. Same with derivatives. Right now, it has no idea; if `d\eqn` is entered, we don't even get `d(U - T S)`, we get the incorrect `dU - T S`.

## Needs repro

- When we have parse weirdness, I frequently get $unexpected$ in the output. Would be much better if that resulted in an error that described why that was happening. I don't have an example at present.
