1.  `x_{n + 1} = x_{n} + \frac{\left(a + b\right)}{2} \Delta t`
    Should allow moving (multiplicative) \Delta t into the fraction, but since it's two terms, this cannot be done

2.  `\frac{a}{b} = \frac{\left(c + d\right)}{e}`
    Should be able to move the b multiplicatively to the RHS. Preview says it's allowed, but when you drop, nothing happens.

3.  `c=\left(a b\right)`
    Preview says we can move b outside the parentheses, but when dropping nothing happens.

4.  `a \left(b c d\right) = e`
    Select both c and d. Dragging the multi-selection out of the parentheses to the LHS does not work (no preview, no execution). Dragging onto the RHS generates a preview, but when executed, incorrectly moves all of b c d to the RHS, resulting in
    `a \left(1\right) = \frac{1}{b c d} e`, which is not desired.

5.  `2 x_2 - x_1`
    if we substitute `x_2` `a+b`, we expect `2 (a+b) - x_1`, but instead we get `2 a + b - x_1`, which is incorrect.

6.  `a=b-c`
    apply `eqn * v`. The result is `a d = b - c d` instead of `a d = b d - c d`

7.  `- w_\text{sh} = \Delta h + \frac12 (\mathscr{V}_2^2 - \mathscr{V}_1^2)`
    This is not parsed right. It comes out mangled in the output as V_s cript_2^2

8.  `\left(a + b \right) - \left(c + d\right) = e`
    It should be possible to move c in additive mode into the left-hand parentheses to get
    `\left(a + b - c\right) - \left(d\right) = e`

9.  `\left(a - c + b\right) - \left(d\right) = e`
    It should be possible to select a and c to substitute for them. But the button is disabled when multiple
    items are selected.

10. `\left(a + b\right) - \left(c d e\right) = f`
    It should be possible to select c d e and move it into the left parentheses to get
    `\left(a + b - c d e\right) = f`

11. `du = \left(\dfrac{\partial {u}}{\partial {T}}\right)_v \, dT`
    Won't parse. Gives an error

12. `d'q = du + P \, dv`
    Once parsed, comes out as `'dq = du + P dv`. The prime is not in the correct position.
    Also, differentials like `dv` and `d'q ` should really be atomic.

13. `\left( a + b + c d - c e \right) = f`
    It should be able to factor c d - c e into c (d - e), but the factor button is grayed.

14. `a = b c + \left[d + e\right] f`
    Select `\left[d + e\right] f` with alt, go to replace function. The selected preview is
    `[d+e](+1selected)` which is weird.
    If you then choose to replace with zero, both terms get replaced. I.e., the result is
    `a = b c + 0 0`

15. `a = \frac{b c + \left[\left(d + e\right)\right] f}{g}`
    If we select `b c` and move it additively outside the fraction, it shows up without
    the denominator, which is mathematically false.

16. `a = b + \frac{\left[c + d\right] e}{f}`
    I can't move e multiplicatively outside the fraction on its own (i.e., I want
    `a = b + \frac{\left[c + d\right]}{f} e` )
    This should also work with the denominator, so I can subsequently do
    `a = b + \left[c + d\right] \frac{e}{f}`

17. `\frac{\partial{u}}{\partial{T}}\right)_{v}`
    In a partial derivative, the inside part of the parentheses is selectable, but actually this whole thing including the parentheses should be atomic.

18. Feature: `\left(a + b - c d e\right) = f`, we should have a way to either add or remove the parentheses
    surrounding the left-hand sum, since it's optional. Maybe a button.

19. Feature: Find a way to represent functions. (a(t))^2 should not expand to a^2 t^2. Maybe via right-click menu
