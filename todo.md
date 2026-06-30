## Low

- If the identity drop down is active and a different term is selected that has no identity, you just have a weird empty box hanging out. I think any interaction other than selecting an item within the menu should close it.

## Medium

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
