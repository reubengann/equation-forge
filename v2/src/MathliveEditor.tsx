import type { KeyboardEvent, RefObject, SyntheticEvent } from "react";

type MathliveEditorProps = {
  slotRef: RefObject<HTMLDivElement | null>;
  latex: string;
  updateMathFieldValue: (event: SyntheticEvent<HTMLElement>) => void;
  onAccept: () => void;
};

export function MathliveEditor({ slotRef, latex, updateMathFieldValue, onAccept }: MathliveEditorProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onAccept();
  };

  return (
    <div
      ref={slotRef}
      style={{
        flex: 1,
        boxSizing: "border-box",
        height: "112px",
        color: "rgba(255, 255, 255, 1.0)",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        overflow: "visible",
        border: "1px solid #757575",
        padding: "10px",
      }}
    >
      <math-field
        id="equation-mathfield"
        className="equation-mathfield"
        data-testid="latex-mathfield"
        value={latex}
        onInput={updateMathFieldValue}
        onKeyDown={handleKeyDown}
        style={{
          width: "100%",
          fontSize: "1.2rem",
          background: "transparent",
          border: "none",
          outline: "none",
          boxShadow: "none",
        }}
      />
    </div>
  );
}
