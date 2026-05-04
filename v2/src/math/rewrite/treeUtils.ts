// import type { CompiledExprIndex, Expr } from "../ast";

// function childrenOf(expr: Expr): Expr[] {
//   switch (expr.kind) {
//     case "number":
//     case "symbol":
//     case "text":
//     case "immutable_expression":
//     case "invalid_input":
//       return [];
//     case "add":
//       return expr.terms;
//     case "multiply":
//       return expr.factors;
//     case "power":
//       return [expr.base, expr.exponent];
//     case "negate":
//       return [expr.value];
//     case "divide":
//       return [expr.numerator, expr.denominator];
//     case "root":
//       return [expr.value];
//     case "equation":
//       return expr.sides;
//     case "inequality":
//       return [expr.lhs, expr.rhs];
//     case "call":
//       return [expr.callee, ...expr.args];
//     case "absolute_value":
//       return [expr.value];
//     case "vector":
//       return [expr.value];
//     case "hat":
//       return [expr.value];
//     case "dotted_expr":
//       return [expr.value];
//     case "primed":
//       return [expr.value];
//     case "special_font":
//       return [expr.value];
//     case "uniterated_integral":
//       return [expr.integrand];
//     case "closed_integral":
//       return [expr.integrand];
//     case "multiple_integral":
//       return [expr.integrand];
//     case "differential":
//       return [expr.variable];
//     case "display_group":
//       return [expr.expression];
//     case "inner_product":
//     case "outer_product":
//       return expr.factors;
//     case "big_sum":
//       return [...(expr.lowerBound ? [expr.lowerBound] : []), ...(expr.upperBound ? [expr.upperBound] : []), expr.summand];
//     case "big_prod":
//       return [
//         ...(expr.lowerBound ? [expr.lowerBound] : []),
//         ...(expr.upperBound ? [expr.upperBound] : []),
//         expr.muliplicand,
//       ];
//     case "integral":
//       return [
//         ...(expr.lowerBound ? [expr.lowerBound] : []),
//         ...(expr.upperBound ? [expr.upperBound] : []),
//         expr.integrand,
//       ];
//     case "partial_derivative":
//       return [expr.quantity, expr.variable];
//     case "full_derivative_operator":
//     case "partial_derivative_operator":
//       return [expr.variable, expr.operand];
//     case "second_order_partial_derivative":
//       return [expr.dependentVariable, ...expr.independentVariables];
//     case "partial_at_const_quantity":
//       return [expr.quantity, expr.variable, expr.constantQuantity];
//   }
// }

// function withChildren(expr: Expr, children: Expr[]): Expr {
//   switch (expr.kind) {
//     case "number":
//     case "symbol":
//     case "text":
//     case "immutable_expression":
//     case "invalid_input":
//       return expr;
//     case "add":
//       return { ...expr, terms: children };
//     case "multiply":
//       return { ...expr, factors: children };
//     case "power":
//       return { ...expr, base: children[0], exponent: children[1] };
//     case "negate":
//       return { ...expr, value: children[0] };
//     case "divide":
//       return { ...expr, numerator: children[0], denominator: children[1] };
//     case "root":
//       return { ...expr, value: children[0] };
//     case "equation":
//       return { ...expr, sides: children };
//     case "inequality":
//       return { ...expr, lhs: children[0], rhs: children[1] };
//     case "call":
//       return { ...expr, callee: children[0], args: children.slice(1) };
//     case "absolute_value":
//     case "vector":
//     case "hat":
//     case "dotted_expr":
//     case "primed":
//     case "special_font":
//       return { ...expr, value: children[0] };
//     case "inner_product":
//     case "outer_product":
//       return { ...expr, factors: children };
//     case "big_sum": {
//       let cursor = 0;
//       const lowerBound = expr.lowerBound ? children[cursor++] : null;
//       const upperBound = expr.upperBound ? children[cursor++] : null;
//       const summand = children[cursor];
//       return { ...expr, lowerBound, upperBound, summand };
//     }
//     case "big_prod": {
//       let cursor = 0;
//       const lowerBound = expr.lowerBound ? children[cursor++] : null;
//       const upperBound = expr.upperBound ? children[cursor++] : null;
//       const muliplicand = children[cursor];
//       return { ...expr, lowerBound, upperBound, muliplicand };
//     }
//     case "integral": {
//       let cursor = 0;
//       const lowerBound = expr.lowerBound ? children[cursor++] : null;
//       const upperBound = expr.upperBound ? children[cursor++] : null;
//       const integrand = children[cursor];
//       return { ...expr, lowerBound, upperBound, integrand };
//     }
//     case "uniterated_integral":
//     case "closed_integral":
//     case "multiple_integral":
//       return { ...expr, integrand: children[0] };
//     case "differential":
//       return { ...expr, variable: children[0] };
//     case "partial_derivative":
//       return { ...expr, quantity: children[0], variable: children[1] };
//     case "full_derivative_operator":
//     case "partial_derivative_operator":
//       return { ...expr, variable: children[0], operand: children[1] };
//     case "display_group":
//       return { ...expr, expression: children[0] };
//     case "second_order_partial_derivative":
//       return { ...expr, dependentVariable: children[0], independentVariables: children.slice(1) };
//     case "partial_at_const_quantity":
//       return { ...expr, quantity: children[0], variable: children[1], constantQuantity: children[2] };
//   }
// }

// export function pathFromNodeId(index: CompiledExprIndex, nodeId: string): number[] | null {
//   if (!index.nodeById[nodeId]) return null;
//   if (nodeId === index.rootId) return [];
//   const path: number[] = [];
//   let cursor: string | null = nodeId;
//   while (cursor && cursor !== index.rootId) {
//     const parentId: string | null = index.parentById[cursor];
//     if (!parentId) return null;
//     const siblings = index.childrenById[parentId] ?? [];
//     const childIndex = siblings.indexOf(cursor);
//     if (childIndex < 0) return null;
//     path.unshift(childIndex);
//     cursor = parentId;
//   }
//   return cursor === index.rootId ? path : null;
// }

// export function getNodeAtPath(root: Expr, path: number[]): Expr | null {
//   let cursor: Expr = root;
//   for (const index of path) {
//     const children = childrenOf(cursor);
//     if (index < 0 || index >= children.length) return null;
//     cursor = children[index];
//   }
//   return cursor;
// }

// export function replaceAtPath(root: Expr, path: number[], replacement: Expr): Expr {
//   const rewrite = (node: Expr, depth: number): Expr => {
//     if (depth === path.length) return replacement;
//     const childIndex = path[depth];
//     const children = childrenOf(node);
//     if (childIndex < 0 || childIndex >= children.length) {
//       throw new Error(`Invalid path index ${childIndex} at depth ${depth}`);
//     }
//     const nextChildren = [...children];
//     nextChildren[childIndex] = rewrite(children[childIndex], depth + 1);
//     return withChildren(node, nextChildren);
//   };
//   return rewrite(root, 0);
// }

// export function exprFingerprint(expr: Expr): string {
//   switch (expr.kind) {
//     case "number":
//       return `number(${String(expr.value)})${expr.error ? `!${expr.error}` : ""}`;
//     case "symbol":
//       return `symbol(${expr.name})${expr.error ? `!${expr.error}` : ""}`;
//     case "text":
//       return `text(${expr.text})${expr.error ? `!${expr.error}` : ""}`;
//     case "immutable_expression":
//       return `immutable(${expr.latex})${expr.error ? `!${expr.error}` : ""}`;
//     case "invalid_input":
//       return `invalid(${expr.latex})${expr.error ? `!${expr.error}` : ""}`;
//     case "add":
//       return `add(${expr.terms.map(exprFingerprint).join(",")})${expr.error ? `!${expr.error}` : ""}`;
//     case "multiply":
//       return `multiply(${expr.factors.map(exprFingerprint).join(",")})${expr.error ? `!${expr.error}` : ""}`;
//     case "power":
//       return `power(${exprFingerprint(expr.base)},${exprFingerprint(expr.exponent)})${expr.error ? `!${expr.error}` : ""}`;
//     case "negate":
//       return `negate(${exprFingerprint(expr.value)})${expr.error ? `!${expr.error}` : ""}`;
//     case "divide":
//       return `divide(${exprFingerprint(expr.numerator)},${exprFingerprint(expr.denominator)})${expr.error ? `!${expr.error}` : ""}`;
//     case "root":
//       return `root(${expr.degree},${exprFingerprint(expr.value)})${expr.error ? `!${expr.error}` : ""}`;
//     case "equation":
//       return `equation(${expr.sides.map(exprFingerprint).join(",")})${expr.error ? `!${expr.error}` : ""}`;
//     case "inequality":
//       return `inequality(${expr.operator},${exprFingerprint(expr.lhs)},${exprFingerprint(expr.rhs)})${expr.error ? `!${expr.error}` : ""}`;
//     case "call":
//       return `call(${expr.delimiter},${exprFingerprint(expr.callee)},${expr.args.map(exprFingerprint).join(",")})${expr.error ? `!${expr.error}` : ""}`;
//     case "absolute_value":
//       return `absolute_value(${exprFingerprint(expr.value)})${expr.error ? `!${expr.error}` : ""}`;
//     case "vector":
//       return `vector(${exprFingerprint(expr.value)})${expr.error ? `!${expr.error}` : ""}`;
//     case "hat":
//       return `hat(${exprFingerprint(expr.value)})${expr.error ? `!${expr.error}` : ""}`;
//     case "inner_product":
//       return `inner_product(${expr.factors.map(exprFingerprint).join(",")})${expr.error ? `!${expr.error}` : ""}`;
//     case "outer_product":
//       return `outer_product(${expr.factors.map(exprFingerprint).join(",")})${expr.error ? `!${expr.error}` : ""}`;
//     case "dotted_expr":
//       return `dotted_expr(${expr.order},${exprFingerprint(expr.value)})${expr.error ? `!${expr.error}` : ""}`;
//     case "primed":
//       return `primed(${expr.order},${exprFingerprint(expr.value)})${expr.name ? `:${expr.name}` : ""}${expr.error ? `!${expr.error}` : ""}`;
//     case "special_font":
//       return `special_font(${expr.font},${exprFingerprint(expr.value)})${expr.error ? `!${expr.error}` : ""}`;
//     case "big_sum":
//       return `big_sum(${expr.lowerBound ? exprFingerprint(expr.lowerBound) : "null"},${
//         expr.upperBound ? exprFingerprint(expr.upperBound) : "null"
//       },${exprFingerprint(expr.summand)})${expr.error ? `!${expr.error}` : ""}`;
//     case "big_prod":
//       return `big_prod(${expr.lowerBound ? exprFingerprint(expr.lowerBound) : "null"},${
//         expr.upperBound ? exprFingerprint(expr.upperBound) : "null"
//       },${exprFingerprint(expr.muliplicand)})${expr.error ? `!${expr.error}` : ""}`;
//     case "integral":
//       return `integral(${expr.lowerBound ? exprFingerprint(expr.lowerBound) : "null"},${
//         expr.upperBound ? exprFingerprint(expr.upperBound) : "null"
//       },${exprFingerprint(expr.integrand)})${expr.error ? `!${expr.error}` : ""}`;
//     case "uniterated_integral":
//       return `uniterated_integral(${exprFingerprint(expr.integrand)})${expr.error ? `!${expr.error}` : ""}`;
//     case "closed_integral":
//       return `closed_integral(${exprFingerprint(expr.integrand)})${expr.error ? `!${expr.error}` : ""}`;
//     case "multiple_integral":
//       return `multiple_integral(${expr.order},${exprFingerprint(expr.integrand)})${expr.error ? `!${expr.error}` : ""}`;
//     case "differential":
//       return `differential(${exprFingerprint(expr.variable)})${expr.error ? `!${expr.error}` : ""}`;
//     case "partial_derivative":
//       return `partial_derivative(${exprFingerprint(expr.quantity)},${exprFingerprint(expr.variable)})${
//         expr.error ? `!${expr.error}` : ""
//       }`;
//     case "full_derivative_operator":
//       return `full_derivative_operator(${exprFingerprint(expr.variable)},${exprFingerprint(expr.operand)})${
//         expr.error ? `!${expr.error}` : ""
//       }`;
//     case "partial_derivative_operator":
//       return `partial_derivative_operator(${exprFingerprint(expr.variable)},${exprFingerprint(expr.operand)})${
//         expr.error ? `!${expr.error}` : ""
//       }`;
//     case "display_group":
//       return `display_group(${expr.delimiter},${exprFingerprint(expr.expression)})${expr.error ? `!${expr.error}` : ""}`;
//     case "second_order_partial_derivative":
//       return `second_order_partial_derivative(${expr.degree},${exprFingerprint(expr.dependentVariable)},${expr.independentVariables
//         .map(exprFingerprint)
//         .join(",")})${expr.error ? `!${expr.error}` : ""}`;
//     case "partial_at_const_quantity":
//       return `partial_at_const_quantity(${exprFingerprint(expr.quantity)},${exprFingerprint(expr.variable)},${exprFingerprint(
//         expr.constantQuantity,
//       )})${expr.error ? `!${expr.error}` : ""}`;
//   }
// }
