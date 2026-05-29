declare module "algebrite" {
  export type AlgebriteNode = {
    k: number;
    cons?: { car: AlgebriteNode; cdr: AlgebriteNode };
    q?: { a: { toString(): string }; b: { toString(): string } };
    d?: number;
    printname?: string;
    toString(): string;
    toLatexString?(): string;
  };

  type AlgebriteApi = {
    version: string;
    CONS: number;
    NUM: number;
    DOUBLE: number;
    STR: number;
    TENSOR: number;
    SYM: number;
    car(node: AlgebriteNode): AlgebriteNode;
    cdr(node: AlgebriteNode): AlgebriteNode;
    cadr(node: AlgebriteNode): AlgebriteNode;
    caddr(node: AlgebriteNode): AlgebriteNode;
    isadd(node: AlgebriteNode): boolean;
    ismultiply(node: AlgebriteNode): boolean;
    ispower(node: AlgebriteNode): boolean;
    iscons(node: AlgebriteNode): boolean;
    isrational(node: AlgebriteNode): boolean;
    isdouble(node: AlgebriteNode): boolean;
    issymbol(node: AlgebriteNode): boolean;
    parse(value: string | number | AlgebriteNode): AlgebriteNode;
    usr_symbol(name: string): AlgebriteNode;
    add(left: AlgebriteNode, right: AlgebriteNode): AlgebriteNode;
    multiply(left: AlgebriteNode, right: AlgebriteNode): AlgebriteNode;
    power(base: AlgebriteNode, exponent: AlgebriteNode): AlgebriteNode;
    sqrt(value: AlgebriteNode): AlgebriteNode;
    sin(value: AlgebriteNode): AlgebriteNode;
    cos(value: AlgebriteNode): AlgebriteNode;
    tan(value: AlgebriteNode): AlgebriteNode;
    log(value: AlgebriteNode): AlgebriteNode;
    exp(value: AlgebriteNode): AlgebriteNode;
    abs(value: AlgebriteNode): AlgebriteNode;
    integral(integrand: AlgebriteNode, variable: AlgebriteNode): AlgebriteNode;
    derivative(operand: AlgebriteNode, variable: AlgebriteNode): AlgebriteNode;
    defint(
      integrand: AlgebriteNode,
      variable: AlgebriteNode,
      lowerBound: AlgebriteNode,
      upperBound: AlgebriteNode,
    ): AlgebriteNode;
    simplify(value: AlgebriteNode): AlgebriteNode;
  };

  const Algebrite: AlgebriteApi;
  export default Algebrite;
}
