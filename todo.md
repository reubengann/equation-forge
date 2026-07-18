## Low

## Medium

- Still having slowness/many-second delay in loading icons in the equation entry component. I thought we switched to pre-loading them, but on cold start there's significant delay. After warmed up, it's instant.

## Hard

- JupyterLab plugin. Have to to think about how we store state, which will be very different.
- Refine/test hit testing. I think there's some jank around symbols.
- Documentation and release.
- vector operations. We don't have any identities surrounding cross or dot products, nor do we do any kind of checks whether a given equation makes dimensional sense (so, e.g., you can do `\eqn + 5` to `\vec{a} = \vec{v} \times \vec{w}`, which is nonsense, but there's nothing to stop you from writing it I think.) This would also presumably require logic at the parsing level, since inputting an invalid equation also breaks comprehension.

## Maybe won't do

- Full-container multi-selections: if we ctrl-click/marquee every direct child of an add/product, should that selection be promoted to the selection of the parent? But then what would happen if we ctrl+click deselect something? We would have to define demotion behavior, e.g. ctrl-clicking `a` while `(a+b)c` is selected as a product.
