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

17. `a + b 0`
    b 0 should be cancellable via the button to 0 and remove the multiplication (InvisibleOperator) if it's in a sum
    (or just stay 0 if it's on its own).

18. `\frac{c_{V} \mathrm{d}{T}}{\mathrm{d}{v}} = -\left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right]`
    If I try to drag `c_{V}` outside the fraction multiplicatively to the left, it doesn't work. A preview is generated indicating it should work, but the result is no change.

19. `c_{V} \frac{\mathrm{d}{T}}{\mathrm{d}{v}} = -\left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right]`
    If we choose the bracket and expand, we expect
    `-\left(\frac{\partial{u}}{\partial{v}}\right)_{T} - P`, but actually nothing happens.
    However, in an expression `a = -\left[b + c\right]`, the result is b + c as expected. That implies that the two are treated differently, which indicates an architecture problem.

20. Feature: It would be nice to understand the differential operator. E.g.
    `h = u + P v`
    Then we apply to both sides `d(eqn)`. The result is `d(h) = d(u + P v)`. However, there's no semantic
    understanding of this. For instance clearly `\mathrm{d}(h)` is equivalent to `dh`, and expansion of
    `d(u + P v)` is `du + P dv + v dP`. If nothing else, expansion should fail due to the roman d.

21. `\mathrm{d}{h} = \mathrm{d}{u} + \mathrm{d}{P} v + P \mathrm{d}{v}`
    Select the middle term in the sum `\mathrm{d}{P} v`. Drag additively to the right of the last term.
    Uncaught Error: Move result failed round-trip tree invariant.
    latex: \mathrm{d}{h} = \mathrm{d}{u} + P \mathrm{d}{v} + \mathrm{d}{P} v
    current: ["Equal",["Differential","h"],["Add",["Differential","u"],["Add",["InvisibleOperator","P",["Differential","v"]],["InvisibleOperator",["Differential","P"],"v"]]]]
    reparsed: ["Equal",["Differential","h"],["Add",["Differential","u"],["InvisibleOperator","P",["Differential","v"]],["InvisibleOperator",["Differential","P"],"v"]]]

22. When I parse `d'q = du + P dv`, the dv is not a differential. It's not roman.

23. `\mathrm{d}'{q} = \mathrm{d}{h} - \mathrm{d}{P} v`
    It seems like if a single-click (down and release) on \mathrm{d}{h} with additive mode selected, it transforms instantly, even though I didn't drag.

24. `\mathrm{d}'{q} = \left(\frac{\partial{h}}{\partial{T}}\right)_{P} \mathrm{d}{T} + \left(\frac{\partial{h}}{\partial{P}}\right)_{T} \mathrm{d}{P} - \mathrm{d}{P} v`
    Choosing the two latter parts of the sum `\left(\frac{\partial{h}}{\partial{P}}\right)_{T} \mathrm{d}{P}` and `\mathrm{d}{P} v` and choosing factor has no result. However in `a = b c + e f - f g` choosing `e f` and `f g` and choosing factor correctly results in `a = b c + f \left(e - g\right)` So there's something inconsistent about
    possibly how we treat derivatives or differentials.

25. `c_{P} \mathrm{d}{T} - c_{v} \mathrm{d}{T} = -\left[\left(\frac{\partial{h}}{\partial{P}}\right)_{T} - v\right] \mathrm{d}{P}`
    Drag \mathrm{d}{T} multiplicatively to the RHS under \mathrm{d}{P}. The result expected is
    `c_{P} - c_{v} = -\left[\left(\frac{\partial{h}}{\partial{P}}\right)_{T} - v\right] \frac{\mathrm{d}{P}}{\mathrm{d}{T}}`
    What actually happens is that the cursor is only to the right of dP. If released:
    Uncaught Error: Move result failed round-trip tree invariant.
    latex: c*{P} \mathrm{d}{T} - c*{v} = -\left[\left(\frac{\partial{h}}{\partial{P}}\right)_{T} - v\right] \mathrm{d}{P} \frac{1}{\mathrm{d}{T}}
    current: ["Equal",["Add",["InvisibleOperator",["Subscript","c","P"],["Differential","T"]],["Negate",["Subscript","c","v"]]],["Negate",["InvisibleOperator",["InvisibleOperator",["List",["Add",["Subscript",["Delimiter",["FractionPartialDerivative",["Partial","h"],["Partial","P"]]],"T"],["Negate","v"]]],["Differential","P"]],["Divide",1,["Differential","T"]]]]]
    reparsed: ["Equal",["Add",["InvisibleOperator",["Subscript","c","P"],["Differential","T"]],["Negate",["Subscript","c","v"]]],["Negate",["InvisibleOperator",["List",["Add",["Subscript",["Delimiter",["FractionPartialDerivative",["Partial","h"],["Partial","P"]]],"T"],["Negate","v"]]],["Differential","P"],["Divide",1,["Differential","T"]]]]]

26. `a b + \left[c - e\right] f = 0`
    Rubber band selection around \left[c - e\right] f. If I click and hold to start a drag on one of the terms,
    it immediately discards the old selection and selects the single item I just clicked. I don't think we should
    do that unless a full click occurs.

27. `a = b c + d e - e f`
    Here de should not be parsed as a differential, but currently it is.

28. `\mathrm{d}'{q} = \left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right] \mathrm{d}{v}`
    If I shift+click the terms on the RHS, I can expand (the button is allowed, and the operation works)
    If I alt+click them, I cannot expand them.

29. `\mathrm{d}'{q} = \left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right] \mathrm{d}{v}`
    Rubber band selection doesn't allow for selection of the bracketed term at all. It actually goes into the children only.

30. Feature: add a button to the editing window along with the current quick items (such as adding partial derivative)
    to automatically add \left( \right) and put the cursor after the (

31. `a = b c e + f \left[g h + i\right]`
    Cannot move f multiplicatively to the right side of the bracketed sum (i.e. `a = b c e + \left[g h + i\right] f`)

32. `a = b c e + \left[g h + i\right] f`
    Feature: I should be able to select a sub-expression like b c and wrap it in parentheses (i.e. `a = (b c) e + \left[g h + i\right] f`). Also I should be able to forcibly remove redundant parentheses. e.g. `a = (b c) e + \left[g h + i\right] f` Select the parenthese around b c and remove them. The same button to do both would be preferable, like force/unforce parentheses.

33. Feature: With a any selection, be able to copy just that selection to the clipboard instead of the whole equation (new button). So in
    `a = (b + c) e f` I can select (b + c) e and click the "copy selection" button to copy (b + c) e to the clip board (or \left(b + \right) e
    if that's what it is)

34. `dx`
    This renders as \mathrm{d}x (which is good). But when I copy the expression to the clipboard, I get `dx`, not `\mathrm{d}x`.

35. `\left(\frac{\partial{u}}{\partial{v}}\right)_{T} = \frac{-c_{v}}{\frac{1}{\left(\frac{\partial{T}}{\partial{v}}\right)_{u}}}`
    If I select the RHS and use the evaluate command, I get `\left(\frac{\partial{u}}{\partial{v}}\right)_{T} = -Delimiter_FractionPartialDerivative_Partial_T_Partial_v_{u} c_{v}`, which is obviously bad.

36. `\left(\frac{\partial{u}}{\partial{v}}\right)_{T} = -c_{v} 0`
    Selecting the RHS and trying to cancel or evaluate should result in 0. If only `c_{v} 0` are chosen, it's cancelable, but ends
    up being `-0` instead of just 0. If the entire RHS is selected, the cancel button is disabled. Evaluate never does anything.

37. `c_{v} = \frac{\mathrm{d}{u}}{\mathrm{d}{T}}`
    Drag dT multiplicatively to the LHS to the right of `c_{v}`. The result is `\frac{c_{v}}{\mathrm{d}{T}} = \frac{\frac{\mathrm{d}{u}}{\mathrm{d}{T}}}{\mathrm{d}{T}}` instead of `c_{v} \mathrm{d}{T} = \mathrm{d}{u}`

38. `u - u_{0} = c_{v} \int_{T_{0}}^{T} \,\mathrm{d}{T}`
    Evaluate the integral. The result is `u - u_{0} = c_{v} T - T_{0}` instead of `u - u_{0} = c_{v} \left(T - T_{0}\right)`

39. `c_{P} - c_{v} = -\left[-v\right] \left(\frac{\partial{P}}{\partial{T}}\right)_{v}`
    Select `\left[-v\right]` and unforce parentheses. The result is `c_{P} - c_{v} = --v \left(\frac{\partial{P}}{\partial{T}}\right)_{v}`

40. `a = b c`
    Replace `b` with `\gamma`. The result is `a = \mathrm{EulerGamma} c` instead of `a = \gamma c`.

41. `\frac{\mathrm{d}{P_{s}}}{\mathrm{d}{v_{s}}} = \gamma \left(\frac{\partial{P}}{\partial{v}}\right)_{T}`
    Replace `\left(\frac{\partial{P}}{\partial{v}}\right)_{T}` with `-\frac{P}{v}`. The result is
    `\frac{\mathrm{d}{P_{s}}}{\mathrm{d}{v_{s}}} = \gamma -\frac{P}{v}`, which is not correct.

42. `\frac{\mathrm{d}{P_{s}}}{\mathrm{d}{v_{s}}} = -\gamma \frac{P}{v}`
    I'm still having the issue that if I rubber-band select the whole RHS, then single click to drag (e.g. the gamma) it immediately deselects the multiselection and selects the item I click.

43. `\frac{\mathrm{d}{P_{s}}}{\mathrm{d}{v_{s}}} = -\gamma \frac{P}{v}`
    Additively move the entire RHS to the left hand side. It produces:
    Uncaught Error: Move result failed round-trip tree invariant.
    latex: \frac{\mathrm{d}{P*{s}}}{\mathrm{d}{v*{s}}} + \gamma \frac{P}{v} = 0
    current: ["Equal",["Add",["FractionDerivative",["Differential",["Subscript","P","s"]],["Differential",["Subscript","v","s"]]],["InvisibleOperator","gamma",["Divide","P","v"]]],0]
    reparsed: ["Equal",["Add",["Divide",["InvisibleOperator","d_upright",["Subscript","P","s"]],["InvisibleOperator","d_upright",["Subscript","v","s"]]],["InvisibleOperator","EulerGamma",["Divide","P","v"]]],0]

44. `\frac{\frac{\mathrm{d}{P_{s}}}{\mathrm{d}{v_{s}}} \mathrm{d}{v_{s}}}{P} + \frac{\gamma}{v} \mathrm{d}{v_{s}} = 0`
    I should be able to cancel or simplify `\frac{\mathrm{d}{P_{s}}}{\mathrm{d}{v_{s}}} \mathrm{d}{v_{s}}` to `\mathrm{d}{P_{s}}`

45. `\frac{\partial{u}}{\partial{T}}\right)_{v}`
    In a partial derivative, the inside part of the parentheses is selectable, but actually this whole thing including the parentheses should be atomic.

46. Feature: Find a way to represent functions. (a(t))^2 should not expand to a^2 t^2.
