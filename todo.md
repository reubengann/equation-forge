1.  `x_{n + 1} = x_{n} + \frac{\left(a + b\right)}{2} \Delta t`
    Should allow moving (multiplicative) \Delta t into the fraction, but since it's two terms, this cannot be done

2.  `\frac{a}{b} = \frac{\left(c + d\right)}{e}`
    Should be able to move the b multiplicatively to the RHS. Preview says it's allowed, but when you drop, nothing happens.

3.  x_1=x\left(t\right)+v\left(t\right)\Delta t+\frac12a\left(t\right)\left(\Delta t\right)^2
    Should allow replacing \Delta t with something, but the button is grayed.

4.  x\_{2} = x \left(t\right) + \left(v \left(t\right) \frac{\Delta t}{2} + v \left(t + \frac{\Delta t}{2}\right) \frac{\Delta t}{2}\right) + \frac{1}{2} a \left(t\right) \left(\frac{\Delta t}{2}\right)^{2} + \frac{1}{2} \left(a \left(t\right) + \frac{1}{2} \dot{a} \left(t\right) \Delta t\right) \left(\frac{\Delta t}{2}\right)^{2}
    Cannot take \frac{\Delta t}{2} out of the expression in parentheses.

5.  In this expression
    x \left(t + \Delta t\right) = x \left(t\right) + \frac{v \left(t\right) \Delta t}{2} + \frac{v \left(t + \frac{\Delta t}{2}\right) \Delta t}{2} + \frac{1}{2} a \left(t\right) \left(\frac{\Delta t}{2}\right)^{2} + \mathcal{O} \left(\left(\frac{\Delta t}{2}\right)^{3}\right) + \frac{1}{2} \left(a \left(t\right) + \frac{1}{2} \dot{a} \left(t\right) \Delta t\right) \frac{\Delta t}{2}^{2} + \mathcal{O} \left(\left(\frac{\Delta t}{2}\right)^{3}\right)
    Dragging the second a(t) out of the parentheses generates a plan, but it doesn't seem to execute.

6.  x \left(t + \Delta t\right) = x \left(t\right) + v \left(t\right) \Delta t + \frac{1}{2} a \left(t\right) \left(\Delta t\right)^{2} + \mathcal{O} \left(\left(\Delta t\right)^{3}\right)
    If we choose to substitute \Delta t, and select the "replace all" button, it doesn't replace the one in front of v.

7.  2 x*{2} - x*{1}
    if we substitute for x_2, the factor of two does not go everywhere.

8.  P = \frac{R T}{\left(v - b\right)} - \frac{a}{v^{2}}
    apply eqn\*v
    P v = \frac{R T}{\left(v - b\right)} - \frac{a}{v^{2}} v
    This is wrong. It didn't apply to both terms on the rhs

9.  Find a way to represent functions. (a(t))^2 should not expand to a^2 t^2. Maybe via right-click menu
