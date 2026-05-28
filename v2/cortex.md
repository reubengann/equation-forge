What exactly does CE do?

The documentation states that factor only supports perfect square trinomials, difference of squares, and quadratics with rational roots.

(ne means no effect/no change from input)

| input                       | evaluate                     | simplify       | expand        | factor |
| --------------------------- | ---------------------------- | -------------- | ------------- | ------ |
| $x + x$                     | $ 2 x $                      | $ 2 x $        | $ 2 x $       | ne     |
| $1 + 2$                     | $ 3 $                        | $ 3 $          | $ 3 $         | $ 3 $  |
| $ (x+y)^2 $                 | ne                           | ne             | $x^2+y^2+2xy$ | ne     |
| $2 a + a x$                 | ne                           | ne             | ne            | ne     |
| $\int x dx$                 | $\frac{x^2}{2}$              | ne             | ne            | ne     |
| $ (x+1)(x+2) $              | $x^2+3x+2$                   | $x^2+3x+2$     | $x^2+3x+2$    | ne     |
| $ \sqrt{y^2} $              | ne                           | $\vert y\vert$ | ne            | $y$    |
| $ \int_a^b \frac{1}{x} dx $ | (I see below)                | ne             |
| $\int_1^2 \frac{1}{x} dx$   | 0.693\,147\,180\,559\,945\,3 | ne             | ne            | ne     |
| $\int_0^\pi \sin x dx$      | $ 2 $                        | ne             | ne            | ne     |
| $\int_a^b \sin x dx$        | (II see below)               | ne             | ne            | ne     |

I = `\left.\left(\ln(\vert x\vert)\right)\right``\|_{x=\mathtip{\error{\blacksquare}}{\in \text{unknown}\notin \text{value}}}`

II = `\left.\left(-\cos(x)\right)\right|_{x=\mathtip{\error{\blacksquare}}{\in \text{unknown}\notin \text{value}}}`
