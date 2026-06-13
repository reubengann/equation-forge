## Low

- Page-level option to copy full equations with $$ $$ around them (persist)

## Medium

- `\left(\frac{\partial{F}}{\partial{T}}\right)_{X_1 , X_2} = -S` In my opinion, the subscript should be parsed as an immutable_expression. I don't think it is right now. It's not something that can be understood in that context, but somehow X_1 and X_2 are individually selectable and replaceable in the character replace modal. This is not necessarily desirable, as they are just acting as a label at that point, I think. Also, comma appears as a replaceable character in the modal. Now, I get why we would want to understand something like `f(X_1, X_2)`, since that's arguments of a function. If we are going to try to comprehend "list of variables" in a subscript, at least we need to omit comma from the modal.

## Hard/Uncertain

- Full-container multi-selections: if we ctrl-click/marquee every direct child of an add/product, should that selection be promoted to the selection of the parent? But then what would happen if we ctrl+click deselect something? We would have to define demotion behavior, e.g. ctrl-clicking `a` while `(a+b)c` is selected as a product.
- vector operations? We likely don't have any identities surrounding cross or dot products, nor do we do any kind of checks whether a given equation makes dimensional sense (so, e.g., you can do `\eqn + 5` to `\vec{a} = \vec{v} \times \vec{w}`, which is nonsense, but there's nothing to stop you from writing it I think.) This would also presumably require logic at the parsing level, since inputting an invalid equation also breaks comprehension.
- If we're already treating subtraction as negative terms in sums, what is the rationale behind keeping divide separate from multiply? Why wouldn't it just be a property inverted: true/false of multiply? Ultimately, whether we treat negate/divide as their own nodes really comes down to whether it makes the code simpler or not. It seemed like making negation a property of terms would make the code simpler; I'm not sure that was totally successful.
- How far do we want to take the system's understanding of things? If I have `F = U - T S` and I do d\eqn, should it comprehend
  that means `dF = d(U - T S) = dU - T dS - S dT`? The same with derivatives? What action would we even take to expand `d` across a sum? It would have to make assumptions about what is variable, or we would have to define it somehow. Same with derivatives. Right now, it has no idea; if `d\eqn` is entered, we don't even get `d(U - T S)`, we get the incorrect `dU - T S`.
- Check whether a product keeps the sign or whether it stays on the terms. Really, if we multiply two terms `-a` and `b`, which is symbol(a, sign: -1) and symbol(b, sign: +1), we should probably just form product([symbol(a, sign: +1), symbol(b, sign: +1)], sign: -1). But right now I'm not sure that's how it works.
