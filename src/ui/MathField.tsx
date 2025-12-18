import React, { useEffect, useRef } from "react";
import { MathfieldElement } from "mathlive";
MathfieldElement.fontsDirectory = "/fonts";
type Props = {
  latex: string;
  onLatexChange: (latex: string) => void;
  mathfieldRef?: React.MutableRefObject<MathfieldElement | null>;
};

export function MathField({ latex, onLatexChange, mathfieldRef }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mfRef = useRef<MathfieldElement | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const mf = new MathfieldElement();
    mf.value = latex;
    mf.smartMode = true;
    mf.addEventListener("input", () => onLatexChange(mf.value));
    hostRef.current.appendChild(mf);

    mfRef.current = mf;
    if (mathfieldRef) mathfieldRef.current = mf;

    return () => {
      mf.remove();
      mfRef.current = null;
      if (mathfieldRef) mathfieldRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mf = mfRef.current;
    if (!mf) return;
    if (mf.value !== latex) mf.value = latex;
  }, [latex]);

  return <div ref={hostRef} />;
}
