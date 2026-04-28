import { MathfieldElement } from "mathlive";
import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { EquationEditor } from "./EquationEditor";
import { MathliveEditor } from "./MathliveEditor";

MathfieldElement.fontsDirectory = "/fonts";

export function EditorEntryToggle() {
  const [latex, setLatex] = useState(String.raw`a+b=c`);
  const [showMathDisplay, setShowMathDisplay] = useState(false);
  const mathDivRef = useRef<HTMLElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showMathDisplay) return;
    const mathDiv = mathDivRef.current as
      | (HTMLElement & { value?: string; render?: () => void })
      | null;
    if (!mathDiv) return;
    // Current placeholder render pipeline is identity.
    mathDiv.setAttribute("virtual-keyboard-mode", "off");
    mathDiv.value = latex;
    mathDiv.textContent = latex;
  }, [showMathDisplay, latex]);

  const updateMathFieldValue = (event: SyntheticEvent<HTMLElement>) => {
    const nextValue =
      (event.currentTarget as HTMLElement & { value?: string }).value ?? "";
    setLatex(nextValue);
  };

  return (
    <section
      className="equation-editor"
      style={{
        maxWidth: "760px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        alignItems: "flex-start",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: "100%",
          display: "flex",
          gap: "8px",
          alignItems: "center",
        }}
      >
        {showMathDisplay ? (
          <EquationEditor slotRef={slotRef} mathDivRef={mathDivRef} latex={latex} />
        ) : (
          <MathliveEditor
            slotRef={slotRef}
            latex={latex}
            updateMathFieldValue={updateMathFieldValue}
          />
        )}
        <button
          type="button"
          data-testid="accept-equation"
          onClick={() => setShowMathDisplay((prev) => !prev)}
          style={{
            width: "40px",
            height: "40px",
            alignSelf: "center",
            boxSizing: "border-box",
            border: "1px solid #757575",
            borderRadius: "3px",
            background: "#424242",
            color: "rgba(255, 255, 255, 0.87)",
            padding: "8px",
          }}
        >
          {showMathDisplay ? "Edit" : "✓"}
        </button>
      </div>
    </section>
  );
}

export default EditorEntryToggle;
