## Low

- I have seen keyboard shortcuts work on an equation while a modal is shown. That should not happen. I believe it only happens when the mathlive input is not selected, but still. When the modal is up, all page input should be blocked.
- The grouping of icons may be kind of arbitrary right now. Probably want to categorize somehow.

## Medium

- Awkward: Start with `x = y + z`. If we apply `d\eqn` we get `dx = dy+z` (wrong). That's because we don't
  comprehend an expression while we're applying. My workaround is to do `d(\eqn)`, which works, but results in
  `\mathrm{d}{\left(x\right)} = \mathrm{d}{\left(y + z\right)}`. The RHS can be expanded with identities, but
  oddly enough the LHS cannot! So I actually have to substitute it with `dx` myself.
- Suppose we have `\left(\frac{\partial{M}}{\partial{y}}\right)_{x} = \left(\frac{\partial{N}}{\partial{x}}\right)_{y}` and apply symbol replacement with `N -> -S`. We get `\left(\frac{\partial{-S}}{\partial{L}}\right)_{T}`
- `\left(\frac{\partial{F}}{\partial{T}}\right)_{X_1 , X_2} = -S` In my opinion, the subscript should be parsed as an immutable_expression. I don't think it is right now. It's not something that can be understood in that context, but somehow X_1 and X_2 are individually selectable and replaceable in the character replace modal. This is not necessarily desirable, as they are just acting as a label at that point, I think. Also, comma appears as a replaceable character in the modal. Now, I get why we would want to understand something like `f(X_1, X_2)`, since that's arguments of a function. If we are going to try to comprehend "list of variables" in a subscript, at least we need to omit comma from the modal.
- `\mathrm{d}{F} = \mathrm{d'}{Q} - \mathrm{d'}{W} - S \,\mathrm{d}{T} - T \,\mathrm{d}{S}`
  `\mathrm{d'}{W} = -\mathscr{F} \,\mathrm{d}{L}`
  Choose to replace `\mathrm{d'}{W}` in the first equation.
  In the modal, we get the option to replace with `-\mathscr{F} \,\mathrm{d}{L}` from the other equation (good)
  When the option is chosen, mathlive shows `--\mathscr{F}\,\mathrm{d}{L}` (double negative signs). Although the final
  result works, this is ugly and awkward.

## Hard/Uncertain

- Full-container multi-selections: if we ctrl-click/marquee every direct child of an add/product, should that selection be promoted to the selection of the parent? But then what would happen if we ctrl+click deselect something? We would have to define demotion behavior, e.g. ctrl-clicking `a` while `(a+b)c` is selected as a product.
- vector operations? We likely don't have any identities surrounding cross or dot products, nor do we do any kind of checks whether a given equation makes dimensional sense (so, e.g., you can do `\eqn + 5` to `\vec{a} = \vec{v} \times \vec{w}`, which is nonsense, but there's nothing to stop you from writing it I think.) This would also presumably require logic at the parsing level, since inputting an invalid equation also breaks comprehension.
- Check whether a product keeps the sign or whether it stays on the terms. Really, if we multiply two terms `-a` and `b`, which is symbol(a, sign: -1) and symbol(b, sign: +1), we should probably just form product([symbol(a, sign: +1), symbol(b, sign: +1)], sign: -1). But right now I'm not sure that's how it works.
