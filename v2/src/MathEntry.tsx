import type { KeyboardEvent, RefObject } from "react";
import { useRef } from "react";
import { MATH_ENTRY_MACROS, type MathEntryMacro } from "./mathEntry/mathEntryMacros";

type MathfieldElementLike = HTMLElement & {
  value?: string;
  getValue?: (format: "latex") => string;
  insert?: (
    latex: string,
    options: {
      insertionMode: "replaceSelection";
      selectionMode: "placeholder";
      format: "latex";
      focus: boolean;
    },
  ) => void;
  executeCommand?: (command: [string, string]) => void;
};

type MathEntryProps = {
  slotRef?: RefObject<HTMLDivElement | null>;
  latex: string;
  onLatexChange: (nextLatex: string) => void;
  onAccept: (latestLatex?: string) => void;
  macros?: MathEntryMacro[];
};

export function MathEntry({
  slotRef,
  latex,
  onLatexChange,
  onAccept,
  macros = MATH_ENTRY_MACROS,
}: MathEntryProps) {
  const mathFieldRef = useRef<MathfieldElementLike | null>(null);

  const readLatexFromField = (): string => {
    const field = mathFieldRef.current;
    if (!field) return latex;
    const value = typeof field.getValue === "function" ? field.getValue("latex") : field.value;
    return typeof value === "string" ? value : latex;
  };

  const syncLatexFromField = () => {
    const nextLatex = readLatexFromField();
    console.log("syncLatexFromField", nextLatex);
    onLatexChange(nextLatex);
    return nextLatex;
  };

  const insertMacro = (macro: MathEntryMacro) => {
    const field = mathFieldRef.current;
    if (!field) return;

    if (typeof field.insert === "function") {
      field.insert(macro.latex, {
        insertionMode: "replaceSelection",
        selectionMode: "placeholder",
        format: "latex",
        focus: true,
      });
    } else if (typeof field.executeCommand === "function") {
      field.executeCommand(["insert", macro.latex]);
      field.focus();
    }

    syncLatexFromField();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const macroIndex = Number(event.key) - 1;
      const macro = Number.isInteger(macroIndex) ? macros[macroIndex] : undefined;
      if (macro) {
        event.preventDefault();
        insertMacro(macro);
        return;
      }
    }

    if (event.key !== "Enter") return;
    event.preventDefault();
    onAccept(syncLatexFromField());
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <div
        role="toolbar"
        aria-label="Math entry macros"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          flexWrap: "wrap",
        }}
      >
        {macros.map((macro, index) => (
          <button
            key={macro.id}
            type="button"
            data-testid={`math-entry-macro-${macro.id}`}
            aria-label={`${macro.title} (Ctrl+${index + 1})`}
            title={`${macro.title} (Ctrl+${index + 1})`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertMacro(macro)}
            style={{
              width: 32,
              height: 32,
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #757575",
              borderRadius: "3px",
              background: "#424242",
              color: "rgba(255, 255, 255, 0.87)",
              cursor: "pointer",
            }}
          >
            {macro.icon}
          </button>
        ))}
      </div>

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
          ref={(field) => {
            mathFieldRef.current = field as MathfieldElementLike | null;
          }}
          id="equation-mathfield"
          className="equation-mathfield"
          data-testid="latex-mathfield"
          value={latex}
          onInput={syncLatexFromField}
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
    </div>
  );
}
