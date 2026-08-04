# Distribute and factor

Distribution and factoring are inverse structural rewrites. This tutorial
starts with a product, expands it, and then restores the common factor.

## Distribute a product

![Distribute a product over a sum](../assets/animations/distribute.gif)

Enter the expression:

$$
x(y+z)
$$

1. Select the complete product by double-clicking \(x\), or marquee-drag around
   the expression.
2. Click ![Distribute selection](../assets/icons/distribute-selection.svg) **Distribute
   selection**, or press <kbd>D</kbd>.

Equation Forge applies \(x\) to each term:

$$
x(y+z)\longrightarrow xy+xz
$$

The action is enabled only when the selected structure matches a supported
distribution rule. Selecting only \(x\) or only \(y+z\) is not enough for this
rewrite.

## Factor the result

![Factor common term from sum](../assets/animations/factor.gif)

With \(xy+xz\) displayed:

1. Triple-click a term until the whole sum is selected (or marquee-drag around both terms to select the complete sum)
2. Click ![Factor selection](../assets/icons/factor-selection.svg) **Factor
   selection**, or press <kbd>F</kbd>.

The common factor is extracted:

$$
xy+xz\longrightarrow x(y+z)
$$

If your terms do not have an obvious common factor, you can force factoring of a term. Suppose we want to pull out the $1/2$ from

$$ \left(a+\frac{1}{2}b\right)$$

Select the parentheses and use the ![Force factor selection](../assets/icons/force-factor-selection.svg) **Force factor selection** dialog. Enter $\frac{1}{2}$

![Factor common term from sum](../assets/animations/force_factor.gif)

## Distinguish factoring from cleanup

Factoring changes the expression's form. By contrast,
![Clean up selection](../assets/icons/clean-up-selection.svg) **Clean up
selection** performs supported local numeric and rational simplifications.
Equation Forge keeps these actions separate so that a derivation does not
silently perform extra algebra.

## What to notice

- Toolbar actions operate on the exact structural selection.
- A disabled button means the selected expression does not match that rewrite.
- Distribution and factoring preserve equivalence but expose different useful
  forms.

Continue to [Substitution](substitution.md)
