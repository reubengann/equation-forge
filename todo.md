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

46. `P v^{\gamma} = K`
    Replace v with `\frac{R T}{P}`. Result is `P \frac{R T}{P}^{\gamma} = K`, which is not right.

47. `P \left(\frac{R T}{P}\right)^{\gamma} = K`
    Select `\left(\frac{R T}{P}\right)^{\gamma}` and expand. Result is `P \frac{R T}{P}^{\gamma} = K`, which is wrong.

48. `P \left(\frac{R T}{P}\right)^{\gamma} = K`
    Apply to both sides `eqn^{\frac{1}{\gamma}}`
    The result is `P \left(\frac{R T}{P}\right)^{\gamma}^{\frac{1}{\gamma}} = K^{\frac{1}{\gamma}}` which is not correct.
    P is being neglected.

49. `\frac{R T P^{\frac{1}{\gamma}}}{P} = K^{\frac{1}{\gamma}}`
    Multiplicatively move `R` to the RHS. Expected is `\frac{T P^{\frac{1}{\gamma}}}{P} = \frac{K^{\frac{1}{\gamma}}}{R}`.
    But what we actually get is `\frac{\frac{R T P^{\frac{1}{\gamma}}}{P}}{R} = \frac{K^{\frac{1}{\gamma}}}{R}`

50. `P v^{\gamma} = K`
    Dragging `v^{\gamma}` works as expected, but if only v is selected, it results in `\frac{P v^{\gamma}}{v} = \frac{K}{v}`. That probably should either not be allowed or it should do the same thing as if gamma were selected.

51. `w = \int_{v_{1}}^{v_{2}} \frac{K}{v^{\gamma}} \,\mathrm{d}{v}`
    Drag K out of the integral. The result is `w = K \int_{v_{1}}^{v_{2}} \,\mathrm{d}{v}` which is wrong.

52. `w = K \left(\frac{v_{2}^{-\gamma + 1}}{-\gamma + 1} - \frac{v_{1}^{-\gamma + 1}}{-\gamma + 1}\right)`
    If I choose the Delimeter node (the whole thing in parentheses), factor is disallowed, but it should be able
    to factor `1 - \gamma`.

53. `w = K \left(\frac{v_{2}^{-\gamma + 1} - v_{1}^{-\gamma + 1}}{-\gamma + 1}\right)`
    I can't move `-\gamma + 1` out of the parentheses below `K` multiplicatively.

54. `P = \frac{K}{v^{\gamma - 1} v}`
    If I move `v` to the LHS, both terms of `v` go. I.e. the result is `P v^{\gamma - 1} v = K`. But it should just be `\frac{P}{v} = \frac{K}{v^{\gamma-1}}`

55. If I enter `dU = d'Q - d'W` I get a result that `\mathrm{d}{U} = \mathrm{d}'{Q} - d' W` instead of `\mathrm{d}{U} = \mathrm{d}'{Q} - \mathrm{d}'{W}`

56. If we start with `\mathrm{d}'{Q} = \mathrm{d}'{W}` and apply to both sides \int(eqn). The result is `\int \left(\mathrm{d}'{Q}\right) \,\mathrm{d}{\mathrm{Nothing}} = \int \left(\mathrm{d}'{W}\right) \,\mathrm{d}{\mathrm{Nothing}}`. One would think the result would just be
    `\int \mathrm{d}'{Q} = \int \mathrm{d}'{W}`
    This might be hard. If the mathjson requires an integration variable, then we would have to go in and find it, and it's not always that
    simple. For instance, suppose that we integrate only once on the argument `dx dy`. Which one would it pick?

57. `\eta = \frac{Q_{2} - Q_{1}}{Q_{2}}`
    Additively taking `Q_2` outside the fraction should result in `\eta = \frac{Q_{2}}{Q_{2}} - \frac{Q_{1}}{Q_{2}}` but actually results in
    `\eta = \frac{Q_{2}}{Q_{2}} + \frac{-Q_{1}}{Q_{2}}`

58. `c_{v} \frac{\mathrm{d}{T}}{\mathrm{d}{v}} = -\frac{R T}{v}`
    I can't select `\mathrm{d}{T}` or `\mathrm{d}{v}` individually.

59. `c_{v} \frac{\mathrm{d}{T}}{\mathrm{d}{v}} = -\frac{R T}{v}`
    Drag `\mathrm{d}{v}` to the RHS. The result should be `c_{v} \mathrm{d}{T} = -\frac{R T}{v} \mathrm{d}{v}` but we actually get `\frac{c_{v} \frac{\mathrm{d}{T}}{\mathrm{d}{v}}}{\mathrm{d}{v}} = -\frac{\frac{R T}{v}}{\mathrm{d}{v}}`

60. `c_{v} \left(T - T_{0}\right) = -R T \int_{v_{0}}^{v} \frac{1}{v} \,\mathrm{d}{v}`
    The integral won't evaluate. I thought the whole reason we upgraded to the newer cortex was to enable this, but nothing happens.
    It might be good to temporarily echo to the console what evaluate is being sent into cortex and what was output. And if you can
    see why it's not working, please fix.

61. `e^{\ln\left(T v^{\frac{R}{c_{v}}}\right)} = e^{K}`
    Right now we have evaluate, but not simplify. I think both are needed. Cortex will readily _simplify_ the LHS:
    ce.parse(`e^{\\ln\\left(T v^{\\frac{R}{c_{v}}}\\right)}`).simplify().json)
    ["Multiply","T",["Power","v",["Divide","R","c_v"]]]

    But it will not _evaluate_ it
    ce.parse(`e^{\\ln\\left(T v^{\\frac{R}{c_{v}}}\\right)}`).evaluate().json)
    ["Power","ExponentialE",["Ln",["Multiply","T",["Power","v",["Divide","R","c_v"]]]]]

    I think we should add a button for that.

62. `\sqrt{5}`
    This fails with an error.

63. `\frac{\frac{5}{3}}{\left(T_{1} + T_{0}\right)} = \left(\Delta T\right)`
    Simplifying the LHS gives an incorrect `\frac{5}{3 T_{0} + T_{1}} = \left(\Delta T\right)` whereas evaluate gives the correct
    `\frac{5}{3 T_{0} + 3 T_{1}} = \left(\Delta T\right)`

64. `\frac{-1}{2} b T_{0}^{2} \frac{1}{2} b T_{1}^{2}`
    This factors as `b \left(\frac{-1}{2} T_{0}^{2} + \frac{1}{2} T_{1}^{2}\right)` which is annoying. It should factor out the 1/2 as well
    `\frac{b}{2}\left(- T_{0}^{2} + T_{1}^{2}\right)`

65. `c_{P} = -\frac{1}{\left(\frac{\partial{T}}{\partial{P}}\right)_{h} \left(\frac{\partial{P}}{\partial{h}}\right)_{T}}`
    Move multiplicatively `\left(\frac{\partial{T}}{\partial{P}}\right)_{h}` to the LHS. The result is
    `\frac{c_{P}}{\left(\frac{\partial{T}}{\partial{P}}\right)_{h}} = -\frac{1}{\left(\frac{\partial{P}}{\partial{h}}\right)_{T}}`
    Which is wrong.

66. `-\left(\frac{\partial{h}}{\partial{P}}\right)_{T} = c_{P} \left(\frac{\partial{T}}{\partial{P}}\right)_{h}`
    Multiply by `-1` on both sides.
    One would hope the result would be `\left(\frac{\partial{h}}{\partial{P}}\right)_{T} = -c_{P} \left(\frac{\partial{T}}{\partial{P}}\right)_{h}`, but instead it's `--1 \left(\frac{\partial{h}}{\partial{P}}\right)_{T} = -1 c_{P} \left(\frac{\partial{T}}{\partial{P}}\right)_{h}`

67. `P \left(\frac{\partial{v}}{\partial{T}}\right)_{P}`
    When this parses, the parentheses are missing in the render for some reason.

68. `h = T \left(R + a\right) + u_{0}`
    I cannot drag T to the RHS of the parentheses to get `h = \left(R + a\right) T + u_{0}`. There is no drop target there.

69. `\frac{c_{P} \mathrm{d}{T}}{T} = \frac{R}{P + b} \mathrm{d}{P}`
    The fraction on the LHS cannot be split up. I want `c_{P} \frac{\mathrm{d}{T}}{T}` but there's no drag target in multiply mode.

70. `\frac{c_{P}}{R} \ln\left(T\right) - \frac{c_{P}}{R} \ln\left(T_{0}\right) - \ln\left(P + b\right) = -\ln\left(P_{0} + b\right)`
    For some reason I cannot move `\frac{c_{P}}{R} \ln\left(T_{0}\right)` additively to the RHS.

71. `d'W = - \mu_0 V \mathscr{H} d\mathscr{H} - \mu_0 V \mathscr{H} d\mathscr{M}`
    When rendered, `\mu` is converted to just `mu` and is no longer recognized as a greek letter. Not observed on other greek letters.

72. `\int \mathrm{d}{U} = \int \mathrm{d}'{Q}` Throws an error.

73. `\mathrm{d}{\left(P V\right)} = \mathrm{d}{\left(n R T\right)}`. First of all, the parentheses do not  
    render. Then, replace LHS with `V d P` in mathlive
    and it doesn't get parsed as a differential. The result is `V d P = \mathrm{d}{\left(n R T\right)}`. I guess mathlive puts a space there.

74. Cannot represent `C_{\mathscr{H}}`. It renders as `C_H_s cript`.

75. `\frac{\mathrm{d}{M}}{C_{C}} = \frac{d \mathscr{H}}{T} - \frac{\mathscr{H}}{T^{2}} \mathrm{d}{T}`
    Drag `T` multiplicatively to the LHS from the first term on the right. Result is
    `\frac{\mathrm{d}{M}}{C_{C}} T = d \mathscr{H} - \frac{\mathscr{H}}{T^{2}} \mathrm{d}{T}`
    which is wrong. This move either needs to be prohibited or needs to apply to the entire sum.

76. It's possible to move multiplicatively the `C_{C}` in `C_{C} \mathrm{d}{\mathscr{H}} = T \mathrm{d}{M} + M \mathrm{d}{T}` to the RHS on only one term and arrive at `\mathrm{d}{\mathscr{H}} = T \frac{\mathrm{d}{M}}{C_{C}} + M \mathrm{d}{T}` which is wrong.

77. `c_{v} \frac{\mathrm{d}{P}}{\mathrm{d}{v}} = -\left(-c_{P} \frac{1}{\left(\frac{\partial{v}}{\partial{P}}\right)_{T}}\right)`
    The RHS won't simplify to cancel the minus signs, even though this eqn will: `a = -b \left(-c\right)`

78. `\frac{19 R T_{1}}{2} - P_{2} v_{1} + W_{\mathrm{ab}} + Q_{\mathrm{ab}} - Q_{\mathrm{ab}} - W_{\mathrm{ab}} - \frac{17 R T_{1}}{2} + P_{1} v_{1} = 0`
    Can't cancel the like terms `Q_{\mathrm{ab}} - Q_{\mathrm{ab}}` no matter how I multiselect them (rubber band, shift+arrow, or ctrl+click.)

79. `c_{v}  \mathrm{d}{T} + \frac{a}{v^{2}}  \mathrm{d}{v} + P  \mathrm{d}{v} = 0`
    Can't select the second two terms `\frac{a}{v^{2}} \mathrm{d}{v} + P \mathrm{d}{v}` with rubber band and move them across the equals sign additively.
    Also using the "copy selection" command copies `\frac{a}{v^{2}} \mathrm{d}{v} P \mathrm{d}{v}` omitting the plus sign.

80. `c_{P} \left(\frac{\partial{T}}{\partial{P}}\right)_{s} = v - \left(\frac{\partial{h}}{\partial{P}}\right)_{T}`
    When `-\left(\frac{\partial{h}}{\partial{P}}\right)_{T}` is selected and the replace dialog entered, even if there is an equation with that
    as the LHS, it isn't recognized as a valid match (maybe because of the negation?).

81. `T_{1} - T_{2} = \int_{V}^{2 V} \frac{a}{c_{v} v^{2}} \,\mathrm{d}{v}`
    The integral cannot be evaluated.

82. `\left(\frac{\partial{T}}{\partial{P}}\right)_{h} = \frac{v \left(-R T b v^{2} + 2 a b^{2} - 4 a b v + 2 a v^{2}\right)}{c_{P} \left(R T v^{3} - 2 a b^{2} + 4 a b v - 2 a v^{2}\right)}`
    Can't select just `-2ab^2+4abv-2av^2` with rubber band select in denominator. Always expands to whole sum.

83. `\left(-b^{2} + 2 b v - v^{2}\right)` does not factor to `-(v-b)^2`

84. `1 + 2 a \left(-\left(v - b\right)^{2}\right)`. If just `2 a \left(-\left(v - b\right)^{2}\right)` is
    selected and simplified, the result is `1 + -2 a \left(-b + v\right)^{2}`, which is not desirable.
    We should get `1 - 2 a \left(-b + v\right)^{2}`.

85. `\left(\frac{\partial{h}}{\partial{T}}\right)_{v} = -\frac{c_{P} \beta \mu}{\kappa} + c_{P}`
    If we select the RHS, factor is disabled, so we can't factor `c_P`.

86. `nc_{v}\left(T_{fB}-T_0\right)=\frac{T_0c_{v}n}{2}` this renders as `n c_{v} \left(T_{\mathrm{fB}} - T_{0}\right) = \frac{T_{0} c_{v} n}{2}` The subscript fB should be italic, not sure why it's coming up as roman.

87. Start with `u = c_{v} T - \frac{a}{v}`. Apply `$$ \frac{\partial}{\partial v}eqn $$` to both sides.
    The resulting parentheses cannot be selected in any way. However, if we enter this expression in anew
    `\frac{\partial}{\partial{v}} u = \frac{\partial}{\partial{v}} \left(c_{v} T - \frac{a}{v}\right)`,
    everything is selectable. So these are apparently not interpreted the same way. Do we not assert
    that the expression MJ is the same when applying to both sides as the new latex?

88. `\mathrm{d}{S} = \frac{\mathrm{d}'{Q}}{T}`. Select `d'Q` and hit replace. In the mathlive box, it says
    `\inexactDifferentialD Q`.

89. `\int \mathrm{d}{S}  = \int \frac{P \mathrm{d}{V}}{T} `
    `T` cannot be moved multiplicatively outside the integral.

90. `\ln\left(\left|V_{f}\right|\right) - \ln\left(\left|V_{0}\right|\right)`
    We should add a simpify rule that combines the logarithms (i.e. `\ln(|V_f|/|V_0|)`)
    And also `\ln a + \ln b = \ln (a b)`

91. `\ln\left(\left|V_{f}\right|\right) - \ln\left(\left|V_{0}\right|\right)` Logs can be
    simplified if selected by double clicking until the entire statement in parentheses is selected.
    But rubber bend selection of the two log terms leaves the simplify button grayed out.

92. `\frac{\mathrm{d}'{W}}{d'Q} = 1 - \frac{T_{c}}{T_{h}}` When entered, the numerator on the LHS shows as
    `'d_upright W`

93. `-T_{c} = -T_{h} \frac{\mathrm{d}{T_{c}}}{\mathrm{d}{T_{h}}}`
    Can't move `dT_c` multiplicatively to the LHS or out of the fraction.

94. `-\left(T_{f} - T_{1}\right)` expands as `-T_{f} - -T_{1}` instead of `-T_{f} + T_{1}`

95. This can be entered in Mathlive, but results in an error as plain text: `-\int_{T_1}^{T_{f}}\frac{\mathrm{d}{T_{c}}}{T_{c}}`.

96. `W = -\int_{T_{1}}^{\sqrt{T_{1} T_{2}}} C_{P} \mathrm{d}{T_{c}}  - \int_{T_{2}}^{\sqrt{T_{1} T_{2}}} C_{P} \mathrm{d}{T_{h}} `
    When I insert this expression, the differentials get dropped and become just T_c and T_h.

97. `W = -\left(C_{P} \sqrt{T_{1} T_{2}} - C_{P} T_{1}\right) - \int_{T_{2}}^{\sqrt{T_{1} T_{2}}} C_{P} \,\mathrm{d}{T_{h}}` Evaluate the right integral. The resulting statement's parentheses cannot be selected. Editing the expression and accepting without changes makes it selectable. I suspect there is a difference between this MJ tree and the one from inserting (i.e. `W = -\left(C_{P} \sqrt{T_{1} T_{2}} - C_{P} T_{1}\right) - \left(C_{P} \sqrt{T_{1} T_{2}} - C_{P} T_{2}\right)`). Make sure there is an assert after an evaluation to check for this.

98. `W = -\left(C_{P} \sqrt{T_{1} T_{2}} - C_{P} T_{1}\right) - \left(C_{P} \sqrt{T_{1} T_{2}} - C_{P} T_{2}\right)` Run simplify on the RHS. Result is `W = C_{P} T_{1} + C_{P} T_{2} + -2 C_{P} \sqrt{T_{1} T_{2}}`. Note the `+ -`.

99. `W = C_{P} T_{1} + C_{P} T_{2} - 2 C_{P} \sqrt{T_{1} T_{2}}` Factor the RHS. Result is
    `W = C_{P} \left(T_{1} + T_{2} + -2 \sqrt{T_{1} T_{2}}\right)` Note the `+ -`.

100.  `\Delta S = c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) - c_{P} m \ln\left(T_{1}\right) + c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) - c_{P} m \ln\left(T_{2}\right)`. The term `c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right)` cannot be dragged additively to the right of `c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right)` so that we get
      `\Delta S = c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) + c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) - c_{P} m \ln\left(T_{1}\right)  - c_{P} m \ln\left(T_{2}\right)`

101.  `\Delta S = c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) + c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) - c_{P} m \ln\left(T_{1}\right) - c_{P} m \ln\left(T_{2}\right)`
      When I select just the first two terms in the sum
      `c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right) + c_{P} m \ln\left(\frac{1}{2} \left(T_{1} + T_{2}\right)\right)`
      I cannot simplify this. The button is grayed.

102.  `\frac{1}{T_{h} - T_{c}} = \frac{Q_{h2}}{\left(Q_{h2} - Q_{c}\right) T_{h}}`
      Drag `T_h` multiplicatively from the denominator of the RHS on the right of the LHS fraction. The result is
      `\frac{\frac{1}{T_{h} - T_{c}}}{T_{h}} = \frac{Q_{h2}}{\left(Q_{h2} - Q_{c}\right)}` which is wrong.
      Dragging to the left of the LHS fraction results in `\frac{1}{T_{h}} \frac{1}{T_{h} - T_{c}} = \frac{Q_{h2}}{\left(Q_{h2} - Q_{c}\right)}`, which is also wrong.

103.  `\mathrm{d}{s} = \frac{1}{T} \left(\frac{\partial{u}}{\partial{T}}\right)_{v} \mathrm{d}{T} + \frac{1}{T} \mathrm{d}{v} \left(\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right)`
      On the RHS, dv cannot be moved multiplicatively to the right of the parentheses (i.e. to arrive at `\mathrm{d}{s} = \frac{1}{T} \left(\frac{\partial{u}}{\partial{T}}\right)_{v} \mathrm{d}{T} + \frac{1}{T} \left(\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right) \mathrm{d}{v}`)

104.  `\mathrm{d}{s} = \frac{1}{T} \left(\frac{\partial{u}}{\partial{T}}\right)_{v} \mathrm{d}{T} + \frac{1}{T} \left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right] \mathrm{d}{v}`
      Rubber band select `\left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right]` and hit copy selection. The result is `\frac{1}{T} \left(\frac{\partial{u}}{\partial{v}}\right)_{T} P`. We drop both
      the brackets and the plus sign.

---- undone ----

105. `\dfrac{\partial^2u}{\partial v\partial T}` This renders as `\frac{\partial \partial u}{\partial v \partial T}`

106. `\frac{1}{T}a=\frac{1}{T}\left\lbrack a+\left(\dfrac{\partial P}{\partial T}\right)_{v}\right\rbrack-\frac{1}{T^2}\left\lbrack\left(\dfrac{\partial u}{\partial v}\right)_{T}+P\right\rbrack` This does not parse.

107. `\left(\frac{\partial{P}}{\partial{T}}\right)_{v} = T \frac{1}{T^{2}} \left[\left(\frac{\partial{u}}{\partial{v}}\right)_{T} + P\right]`
     Select `T \frac{1}{T^{2}}` and simplify. Instead of `1/T` you get `T T^{-2}`

108. `\mathrm{d}{s} = \frac{1}{T} \left(\frac{\partial{h}}{\partial{T}}\right)_{P} \mathrm{d}{T} + \frac{1}{T} \left[\left(\frac{\partial{h}}{\partial{P}}\right)_{T} - v\right] \mathrm{d}{P}`
     Rubber band select `\frac{1}{T} \left(\frac{\partial{h}}{\partial{T}}\right)_{P} \mathrm{d}{T} + \frac{1}{T} \left[\left(\frac{\partial{h}}{\partial{P}}\right)_{T} - v\right]`
     what ends up copied is `\left[\left(\frac{\partial{h}}{\partial{P}}\right)_{T} - v\right]`, missing the `1/T` part.

109. `\ln (a/b)` should expand to `ln a - ln b`

110. `\int_{V_{0}}^{V} \frac{R}{v - b} \,\mathrm{d}{v}`
     This can't be evaluated.

111. `\int_{T_{0}}^{T} \frac{\mathrm{d}{T}}{T}  = -\int_{V_{0}}^{V} \frac{1}{3 V} \,\mathrm{d}{V}`
     Drag the 3 out of the integral. Gives `\int_{T_{0}}^{T} \frac{\mathrm{d}{T}}{T}  = -3 \int_{V_{0}}^{V} \frac{1}{V} \,\mathrm{d}{V}` which is wrong.

112. `P \left(v - b\right) = R T`
     The parentheses are not selectable. Why?

113. We need fraction tools. Such as
     - Apply to numerator and denominator (e.g. `\frac{T}{\frac{a}{R}}` multiply top/bottom by `R` to get `\frac{R T}{a}`)
     - Flip term from denominator to numerator or vice versa (e.g. `\frac{a}{b^2} to a b^{-2}`)

114. Feature: Need to come up with some way to perform partial derivatives.

115. Maybe start over?

116. Save/export history. Instead of storing the states in memory only, store the latex after each manipulation, and reload it from local storage each time. This will allow undo/redo across reloads. Then add a "copy entire history" button that copies all of the equations, `$$ <state1> $$\n$$ <state2> $$\n` etc. A change to an intermediate step invalidates the history after it.

117. Upgrade cortexjs to newest version.

118. Error feedback. Right now it just goes into the console when something like unbalanced \left/\right happens or unknown symbol occurs.

119. Symbol replacement would be nice. If you have an identity you want to apply, often you just want to drill into the expression and swap the symbols with the ones from your problem.
