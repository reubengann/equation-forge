# Worked derivation: Carnot reservoirs

This tutorial adapts Sears and Salinger problem 5.20. Two identical finite
systems have constant heat capacity \(C_P\) and initial temperatures
\(T_2>T_1>0\).

We compare two ways of bringing them to equilibrium:

1. use them as the reservoirs of a reversible Carnot engine;
2. place them in direct thermal contact inside a rigid adiabatic enclosure.

The first process ends at the geometric mean; the second ends at the
arithmetic mean.

## 1. Reversible engine: obtain the differential relation

For an infinitesimal engine cycle:

$$
\frac{\mathrm{d}'Q_c}{T_c}+
\frac{\mathrm{d}'Q_h}{T_h}=0
$$

Constant heat capacity gives:

$$
\mathrm{d}'Q_h=-C_P\,\mathrm{d}T_h,
\qquad
\mathrm{d}'Q_c=-C_P\,\mathrm{d}T_c
$$

Use ![Substitute](../assets/icons/substitute.svg) **Substitute** for the two
heat transfers, then cancel \(C_P\):

$$
\frac{\mathrm{d}T_h}{T_h}
=-\frac{\mathrm{d}T_c}{T_c}
$$

Differential and integral notation support is still evolving. If a particular
selection is immutable, enter the resulting relation as a new equation row and
continue the algebra there.

## 2. Integrate between the initial and final states

Both reservoirs finish at \(T_f\). To integrate the differential relation:

1. Click ![Apply operation](../assets/icons/apply-operation.svg) **Apply
   operation** and enter `\int \eqn`. Leave the integration variable
   unspecified so that the template can be applied to both sides.
2. Add the limits to each integral. Either edit the equation directly, or
   select each integral and use
   ![Substitute](../assets/icons/substitute.svg) **Substitute** to enter its
   bounded form. The hot reservoir runs from \(T_2\) to \(T_f\); the cold
   reservoir runs from \(T_1\) to \(T_f\).

**MathLive tip:** A newly entered integral may not display empty limit fields.
Place the cursor immediately to the left of the integrand—just after the
integral symbol—then press <kbd>\_</kbd> to create or enter the lower-limit
field, or <kbd>^</kbd> for the upper-limit field. Enter the bound and repeat
for the other limit.

After placing the negative sign outside the cold-side integral, the equation
is:

$$
\int_{T_2}^{T_f}\frac{\mathrm{d}T_h}{T_h}
=-\int_{T_1}^{T_f}\frac{\mathrm{d}T_c}{T_c}
$$

Select each integral and click
![Evaluate selection](../assets/icons/evaluate-selection.svg) **Evaluate
selection**. The bundled Algebrite evaluator gives:

$$
\ln\left(\frac{T_f}{T_2}\right)
=-\ln\left(\frac{T_f}{T_1}\right)
$$

Move the right-hand logarithm to the left in additive mode:

$$
\ln\left(\frac{T_f}{T_2}\right)
+\ln\left(\frac{T_f}{T_1}\right)=0
$$

Select the sum and use ![Apply
identity](../assets/icons/apply-identity.svg) **Apply identity**. Applying the
log-product identity gives:

$$
\ln\left(
\frac{T_f}{T_2}\frac{T_f}{T_1}
\right)=0
$$

Select the product inside the logarithm and use
![Clean up selection](../assets/icons/clean-up-selection.svg) **Clean up
selection** to obtain:

$$
\ln\left(\frac{T_f^2}{T_1T_2}\right)=0
$$

Known logarithm caveats are satisfied because thermodynamic temperatures are
positive.

## 3. Isolate the reversible final temperature

Exponentiate both sides. Use ![Apply
operation](../assets/icons/apply-operation.svg) **Apply operation** with the
template `e^{\eqn}`:

$$
e^{\ln(T_f^2/(T_1T_2))}=e^0
$$

Apply the exponential/log identity on the left and clean up \(e^0\) on the
right. Alternatively, enter the equivalent result as the next row:

$$
\frac{T_f^2}{T_1T_2}=1
$$

Multiplicative moves give:

$$
T_f^2=T_1T_2
$$

Taking the positive square root:

$$
T_f=\sqrt{T_1T_2}
$$

The negative root is excluded because absolute temperature is positive.

## 4. Direct contact: derive the arithmetic mean

In a rigid adiabatic enclosure, heat lost by the hot system equals heat gained
by the cold system:

$$
C_P(T_f-T_2)=-C_P(T_f-T_1)
$$

Cancel \(C_P\), distribute both sides with
![Distribute selection](../assets/icons/distribute-selection.svg)
**Distribute selection**, and collect the two \(T_f\) terms:

$$
2T_f=T_1+T_2
$$

Move the factor \(2\) in
![Multiplicative move
mode](../assets/icons/multiplicative-move-mode.svg) **Multiplicative move
mode**:

$$
T_f=\frac{T_1+T_2}{2}
$$

## 5. Compare the two final temperatures

For positive \(T_1\) and \(T_2\), begin with a square:

$$
\left(\sqrt{T_2}-\sqrt{T_1}\right)^2\geq0
$$

Select the squared binomial and click
![Apply identity](../assets/icons/apply-identity.svg) **Apply identity**. The
binomial-square identity gives:

$$
\left(\sqrt{T_2}\right)^2+\left(\sqrt{T_1}\right)^2
-2\sqrt{T_2}\sqrt{T_1}\geq0
$$

Select the left-hand side and click
![Clean up selection](../assets/icons/clean-up-selection.svg) **Clean up
selection**. Cleanup cancels each matching square and square-root operation:

$$
T_2+T_1-2\sqrt{T_2}\sqrt{T_1}\geq0
$$

Switch to
![Multiplicative move mode](../assets/icons/multiplicative-move-mode.svg)
**Multiplicative move mode**. Drag \(T_2\) from inside \(\sqrt{T_2}\) and drop
it after \(T_1\) inside \(\sqrt{T_1}\). Equation Forge permits this move
because the two radicals have the same root degree, producing
\(\sqrt{T_1T_2}\). Then rearrange the first two terms:

$$
T_1+T_2-2\sqrt{T_1T_2}\geq0
$$

Move the last term to the right and divide by \(2\):

$$
\frac{T_1+T_2}{2}\geq\sqrt{T_1T_2}
$$

(Note that multiplicative drag across an inequality is not allowed, since it has the possibility of flipping the direction of the inequality depending on the sign of the term. But you can apply `\eqn/2` to both sides)

Thus direct contact reaches a final temperature at least as high as the
reversible engine process. Equality holds only when \(T_1=T_2\), when there
was no initial temperature difference to exploit.

Equation Forge can perform the additive and multiplicative rearrangements.
The implication from a nonnegative square and the choice of a positive square
root encode physical assumptions that the software does not prove.

## What this derivation demonstrates

- Substitution connects constitutive relations to a conservation law.
- Named logarithm identities can compress a multi-step derivation.
- The same initial systems reach arithmetic-mean or geometric-mean
  temperatures depending on the process.
- Domain assumptions matter when applying logarithms, square roots, and
  inequalities.

Source: Sears and Salinger, problem 5.20, adapted from the project notebook
`study/thermo/sears/ch05/sears-5.20.ipynb`.
