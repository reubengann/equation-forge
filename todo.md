## Low

## Medium

- Right now `\frac{\mathrm{d}{\sigma}}{\mathrm{d}{T}}` is not recognized as a full derivative, but instead as a quotient

```
- n1 divide
  - n2 differential [numerator]
    - n3 symbol [variable] (name=\sigma)
  - n4 differential [denominator]
    - n5 symbol [variable] (name=T)
```

This causes problems when, say, pulling it out of an integral, because it is treated as a quotient of differentials.

- `\mathrm{d}{n_1}^{\left(1\right)}` This parses as

```
- n1 differential
  - n2 power [variable]
    - n3 symbol [base] (name=n_1)
    - n4 display_group [exponent] (delimiter=paren)
      - n5 number [expression] (value=1)
```

I think this leads to difficulty. Really, this is just differential of a symbol, which happens to be `n_1^{(1)}`. But continuing the semantic tree, it's like we tell all functionality that it's an exponent `(1)`, but that's just an indicating superscript, no different than a subscript really. There may be many such things in the codebase, complicating manipulation. If we were to send this through algebrite, for instance, it would certainly fail. This also requires thingsl ike postfixVariableSubscript to be tracked, which could be handled at parsing IMO.

## Hard

- JupyterLab plugin.
- Refine/test hit testing. Dragging into a denominator is particularly ugly, as it presents a horizontal line through existing symbols.
- Documentation and release.
- vector operations. We don't have any identities surrounding cross or dot products, nor do we do any kind of checks whether a given equation makes dimensional sense (so, e.g., you can do `\eqn + 5` to `\vec{a} = \vec{v} \times \vec{w}`, which is nonsense, but there's nothing to stop you from writing it I think.) This would also presumably require logic at the parsing level, since inputting an invalid equation also breaks comprehension.

## Maybe won't do

- Full-container multi-selections: if we ctrl-click/marquee every direct child of an add/product, should that selection be promoted to the selection of the parent? But then what would happen if we ctrl+click deselect something? We would have to define demotion behavior, e.g. ctrl-clicking `a` while `(a+b)c` is selected as a product.
