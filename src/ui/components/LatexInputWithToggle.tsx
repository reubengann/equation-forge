import type { CSSProperties, ReactNode, RefObject } from "react";
import { vecMacroOptions } from "../../infra/mathlive/vecMacroOptions";
import {
  fromMathLiveLatex,
  toMathLiveLatex,
} from "../../infra/mathlive/differentialLatex";

export type InputMode = "mathlive" | "text";

type LatexInputWithToggleProps = {
  inputMode: InputMode;
  latex: string;
  onLatexChange: (latex: string) => void;
  onInputModeChange: (mode: InputMode) => void;
  mathFieldRef?: RefObject<any>;
  textAreaRef?: RefObject<HTMLTextAreaElement | null>;
  MathField: any;
  dataTestId?: string;
  radioName: string;
  macros?: Record<string, string>;
  textAreaMinHeight?: number;
  containerStyle?: CSSProperties;
  fieldStyle?: CSSProperties;
  actionButton?: {
    label?: ReactNode;
    onClick: () => void;
    title?: string;
    dataTestId?: string;
    disabled?: boolean;
    style?: CSSProperties;
    ariaLabel?: string;
  };
};

export function LatexInputWithToggle({
  inputMode,
  latex,
  onLatexChange,
  onInputModeChange,
  mathFieldRef,
  textAreaRef,
  MathField,
  dataTestId,
  radioName,
  macros = vecMacroOptions.macros,
  textAreaMinHeight = 80,
  containerStyle,
  fieldStyle,
  actionButton,
}: LatexInputWithToggleProps) {
  const sharedFieldStyle: CSSProperties = {
    width: "100%",
    padding: 10,
    border: "1px solid var(--dp-border, #ccc)",
    borderRadius: 8,
    ...fieldStyle,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, ...containerStyle }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="radio"
            name={radioName}
            value="mathlive"
            checked={inputMode === "mathlive"}
            onChange={() => onInputModeChange("mathlive")}
          />
          MathLive
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="radio"
            name={radioName}
            value="text"
            checked={inputMode === "text"}
            onChange={() => onInputModeChange("text")}
          />
          Plain text (LaTeX)
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: "1 1 auto" }}>
          {inputMode === "mathlive" ? (
            <MathField
              ref={(el: any) => {
                if (mathFieldRef) (mathFieldRef as any).current = el;
              }}
              value={toMathLiveLatex(latex)}
              style={sharedFieldStyle}
              data-testid={dataTestId}
              onInput={(e: any) =>
                onLatexChange(fromMathLiveLatex(e.target?.value ?? ""))
              }
              macros={macros}
            />
          ) : (
            <textarea
              ref={textAreaRef as RefObject<HTMLTextAreaElement>}
              value={latex}
              onChange={(e) => onLatexChange(e.target.value)}
              style={{
                ...sharedFieldStyle,
                minHeight: textAreaMinHeight,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                background: "var(--dp-surface)",
                color: "inherit",
              }}
              data-testid={dataTestId}
            />
          )}
        </div>
        {actionButton ? (
          <button
            type="button"
            onClick={actionButton.onClick}
            title={actionButton.title}
            aria-label={actionButton.ariaLabel ?? actionButton.title}
            data-testid={actionButton.dataTestId}
            disabled={actionButton.disabled}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #888",
              cursor: actionButton.disabled ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 40,
              height: 40,
              background: "#1e1e1e",
              color: "inherit",
              ...actionButton.style,
            }}
          >
            {actionButton.label ?? "✓"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
