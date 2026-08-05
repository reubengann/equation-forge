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

Despite `\frac{\partial{x}}{\partial{y}}` being parsed as

```
- n1 partial_derivative
  - n2 symbol [quantity] (name=x)
  - n3 symbol [variable] (name=y)
```

This causes problems when, say, pulling it out of an integral, because it is treated as a quotient of differentials. To a certain extent it makes sense, since those two components can be dragged separately, whereas in a partial derivative they cannot. But instead we could treat pulling a differential out of a full derivative as a new move rule. That would bridge the semantic gap between `full derivative` and `ratio of differentials`.

## Hard

- JupyterLab plugin integration with other plugins
- Refine/test hit testing. Dragging into a denominator is particularly ugly, as it presents a horizontal line through existing symbols.
- Documentation and release.
- vector operations. We don't have any identities surrounding cross or dot products, nor do we do any kind of checks whether a given equation makes dimensional sense (so, e.g., you can do `\eqn + 5` to `\vec{a} = \vec{v} \times \vec{w}`, which is nonsense, but there's nothing to stop you from writing it I think.) This would also presumably require logic at the parsing level, since inputting an invalid equation also breaks comprehension.

## Maybe won't do

- Full-container multi-selections: if we ctrl-click/marquee every direct child of an add/product, should that selection be promoted to the selection of the parent? But then what would happen if we ctrl+click deselect something? We would have to define demotion behavior, e.g. ctrl-clicking `a` while `(a+b)c` is selected as a product.
