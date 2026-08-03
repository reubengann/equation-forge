# Worked derivation: enthalpy from an equation of state

This tutorial adapts Sears and Salinger problem 4.08(a). A gas obeys:

$$
(P+b)v=RT
$$

and has specific internal energy:

$$
u=aT+bv+u_0
$$

Starting from the definition \(h=u+Pv\), we will derive:

$$
h=(a+R)T+u_0
$$

Unlike a general equation-solving problem, every step in this derivation maps
directly to an Equation Forge selection, move, or rewrite.

## 1. Create the source equations

Add three equation rows to the pad:

$$
(P+b)v=RT
$$

$$
u=aT+bv+u_0
$$

$$
h=u+Pv
$$

The first two rows provide substitution rules. The third is the equation we
will transform.

## 2. Isolate \(Pv\) in the equation of state

Activate the equation-of-state row. Select the product \((P+b)v\), then click
![Distribute selection](../assets/icons/distribute-selection.svg)
**Distribute selection**, or press <kbd>D</kbd>:

$$
Pv+bv=RT
$$

Make sure ![Additive move
mode](../assets/icons/additive-move-mode.svg) **Additive move mode** is active.
Select \(bv\), drag it to the right-hand side, and release at the insertion
preview:

$$
Pv=RT-bv
$$

This derived row can now replace the complete product \(Pv\), not merely the
individual symbols \(P\) and \(v\).

## 3. Substitute into the enthalpy definition

Activate:

$$
h=u+Pv
$$

Select \(u\), click ![Substitute](../assets/icons/substitute.svg)
**Substitute**, and choose the internal-energy relation. Then select the
complete product \(Pv\), open **Substitute** again, and choose the rearranged
equation of state.

Because both replacements are terms in an outer sum, Equation Forge splices
their terms directly into that sum:

$$
h=aT+bv+u_0+RT-bv
$$

## 4. Cancel terms

Select the complete right-hand side and click
![Clean up selection](../assets/icons/clean-up-selection.svg) **Clean up
selection**, or press <kbd>C</kbd>. The additive inverses \(bv\) and \(-bv\)
cancel:

$$
h=aT+u_0+RT
$$

## 5. Factor the temperature

In additive mode, drag \(RT\) to the position immediately after \(aT\):

$$
h=aT+RT+u_0
$$

Marquee-select \(aT\) and \(RT\), then click
![Factor selection](../assets/icons/factor-selection.svg) **Factor selection**,
or press <kbd>F</kbd>:

$$
h=T(a+R)+u_0
$$

To match the conventional order, switch to
![Multiplicative move
mode](../assets/icons/multiplicative-move-mode.svg) **Multiplicative move
mode** and drag \(T\) after the parenthesized factor:

$$
h=(a+R)T+u_0
$$

## What this derivation demonstrates

- A derived equation can become a substitution rule for a compound selection.
- Additive substitutions are inserted directly into the surrounding sum.
- Cleanup cancels additive inverses without performing unrelated algebra.
- Factoring and rearranging expose the conventional final form.

Source: Sears and Salinger, problem 4.08(a), adapted from the project notebook
`study/thermo/sears/ch04/sears-4.08.ipynb`.
