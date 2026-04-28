import type { RefObject } from "react";

type EquationEditorProps = {
  slotRef: RefObject<HTMLDivElement | null>;
  mathDivRef: RefObject<HTMLElement | null>;
  latex: string;
};

export function EquationEditor({ slotRef, mathDivRef, latex }: EquationEditorProps) {
  return (
    <div
      ref={slotRef}
      style={{
        flex: 1,
        boxSizing: "border-box",
        borderRadius: "3px",
        color: "rgba(255, 255, 255, 1.0)",
        padding: "16px",
        textAlign: "left",
        display: "flex",
      }}
    >
      <math-div
        ref={mathDivRef}
        data-testid="math-div-output"
        mode="displaystyle"
        value={latex}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
        }}
      />
    </div>
  );
}
