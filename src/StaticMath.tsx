import { useEffect, useRef, type CSSProperties } from "react";

type MathDivLike = HTMLElement & {
  value?: string;
  render?: () => void;
};

type StaticMathProps = {
  latex: string;
  testId?: string;
  style?: CSSProperties;
};

export function StaticMath({ latex, testId, style }: StaticMathProps) {
  const mathRef = useRef<MathDivLike | null>(null);

  useEffect(() => {
    const math = mathRef.current;
    if (!math) return;
    math.value = latex;
    math.setAttribute("value", latex);
    math.textContent = latex;
    math.render?.();
  }, [latex]);

  return (
    <math-div
      ref={(element) => {
        mathRef.current = element as MathDivLike | null;
      }}
      data-testid={testId}
      mode="displaystyle"
      value={latex}
      style={{ display: "block", ...style }}
    />
  );
}
