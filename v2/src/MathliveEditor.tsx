import type { KeyboardEvent, RefObject, SyntheticEvent } from "react";

type MathliveEditorProps = {
  slotRef: RefObject<HTMLDivElement | null>;
  latex: string;
  updateMathFieldValue: (event: SyntheticEvent<HTMLElement>) => void;
  onAccept: () => void;
};

export function MathliveEditor({
  slotRef,
  latex,
  updateMathFieldValue,
  onAccept,
}: MathliveEditorProps) {
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
        borderRadius: "3px",
        color: "rgba(255, 255, 255, 1.0)",
        padding: "8px",
        textAlign: "left",
        display: "flex",
      }}
    >
      <math-field
        id="equation-mathfield"
        data-testid="latex-mathfield"
        value={latex}
        onInput={updateMathFieldValue}
        onKeyDown={handleKeyDown}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
        }}
      />
    </div>
  );
}
