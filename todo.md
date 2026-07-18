## Low

- Editing should not remove history. Duplicating expression maybe shouldn't copy history.
- `G_f = n_1 g_{1f} + n_2 g_{2f}` replace symbol option gives options like `2f` but also `g_{2f}`.

## Medium

## Hard

- What is the identity API? Is it flexible enough to have user-defined identities? For instance, I want to have the chain rule for partial derivatives at constant quantities, or the cycle rule, or the reciprocal rule. Pretty specific to thermodynamics for a general math manipulation library; would be lovely if this were possible to define at a user level, but I suspect that's hard.
- JupyterLab plugin. Have to to think about how we store state, which will be very different.
- Refine/test hit testing. I think there's some jank around symbols.
- Documentation and release.
- vector operations. We don't have any identities surrounding cross or dot products, nor do we do any kind of checks whether a given equation makes dimensional sense (so, e.g., you can do `\eqn + 5` to `\vec{a} = \vec{v} \times \vec{w}`, which is nonsense, but there's nothing to stop you from writing it I think.) This would also presumably require logic at the parsing level, since inputting an invalid equation also breaks comprehension.

## Maybe won't do

- Full-container multi-selections: if we ctrl-click/marquee every direct child of an add/product, should that selection be promoted to the selection of the parent? But then what would happen if we ctrl+click deselect something? We would have to define demotion behavior, e.g. ctrl-clicking `a` while `(a+b)c` is selected as a product.
