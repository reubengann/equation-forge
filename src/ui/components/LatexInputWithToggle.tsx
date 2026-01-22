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
  const derivativeMathLive =
    "\\dfrac{\\differentialD \\placeholder{}}{\\mathrm{d}\\placeholder{}}";
  const derivativeText = "\\dfrac{\\mathrm{d}{}}{\\mathrm{d}{}}";
  const derivativeTextCaretOffset = derivativeText.indexOf("{}") + 1;

  const partialMathLive =
    "\\dfrac{\\partial \\placeholder{}}{\\partial \\placeholder{}}";
  const partialText = "\\dfrac{\\partial {}}{\\partial {}}";
  const partialTextCaretOffset = partialText.indexOf("{}") + 1;

  const integralMathLive = "\\int_{a}^{b}\\,\\differentialD x";
  const integralText = "\\int_{a}^{b} \\, \\mathrm{d}{x}";
  const integralTextCaretOffset = integralText.indexOf("\\mathrm");

  const indefiniteIntegralMathLive = "\\int\\,\\differentialD x";
  const indefiniteIntegralText = "\\int  \\, \\mathrm{d}{x}";
  const indefiniteIntegralTextCaretOffset = indefiniteIntegralText.indexOf("  ") + 2;

  function insertMathLive(latexSnippet: string) {
    const field = mathFieldRef?.current as any;
    if (!field) return;

    if (typeof field.insert === "function") {
      field.insert(latexSnippet, {
        insertionMode: "replaceSelection",
        selectionMode: "placeholder",
        format: "latex",
        focus: true,
      });
    } else if (typeof field.executeCommand === "function") {
      field.executeCommand(["insert", latexSnippet]);
    }

    const value =
      typeof field.getValue === "function"
        ? field.getValue("latex")
        : field.value ?? "";

    const normalized = fromMathLiveLatex(value ?? "");
    onLatexChange(normalized);
  }

  function insertText(snippet: { text: string; caretOffset: number }) {
    const ta = textAreaRef?.current;
    const start = ta?.selectionStart ?? latex.length;
    const end = ta?.selectionEnd ?? latex.length;
    const next = latex.slice(0, start) + snippet.text + latex.slice(end);
    const caret = start + snippet.caretOffset;

    const setCaret = (target: HTMLTextAreaElement | null | undefined) => {
      if (!target) return;
      const pos = Math.min(Math.max(0, caret), next.length);
      target.value = next;
      target.focus();
      target.setSelectionRange(pos, pos);
    };

    // Apply immediately to the live textarea so the next user keystroke lands correctly.
    setCaret(ta);

    onLatexChange(next);

    // Restore caret after the controlled update/render.
    requestAnimationFrame(() => setCaret(textAreaRef?.current));
    setTimeout(() => setCaret(textAreaRef?.current), 0);
  }

  function handleInsertDerivative() {
    if (inputMode === "mathlive") {
      insertMathLive(derivativeMathLive);
    } else {
      insertText({ text: derivativeText, caretOffset: derivativeTextCaretOffset });
    }
  }

  function handleInsertIntegral() {
    if (inputMode === "mathlive") {
      insertMathLive(integralMathLive);
    } else {
      insertText({ text: integralText, caretOffset: integralTextCaretOffset });
    }
  }

  function handleInsertIndefiniteIntegral() {
    if (inputMode === "mathlive") {
      insertMathLive(indefiniteIntegralMathLive);
    } else {
      insertText({
        text: indefiniteIntegralText,
        caretOffset: indefiniteIntegralTextCaretOffset,
      });
    }
  }

  function handleInsertPartialDerivative() {
    if (inputMode === "mathlive") {
      insertMathLive(partialMathLive);
    } else {
      insertText({ text: partialText, caretOffset: partialTextCaretOffset });
    }
  }

  const sharedFieldStyle: CSSProperties = {
    width: "100%",
    padding: 10,
    border: "1px solid var(--dp-border, #ccc)",
    borderRadius: 8,
    ...fieldStyle,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, ...containerStyle }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
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

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={handleInsertDerivative}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--dp-border, #666)",
              background: "var(--dp-surface, #111)",
              color: "inherit",
              cursor: "pointer",
            }}
            title="Insert derivative d/dt"
            aria-label="Insert derivative d over dt"
            data-testid="snippet-derivative"
          >
            d/dt
          </button>
          <button
            type="button"
            onClick={handleInsertIntegral}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--dp-border, #666)",
              background: "var(--dp-surface, #111)",
              color: "inherit",
              cursor: "pointer",
            }}
            title="Insert definite integral"
            aria-label="Insert definite integral"
            data-testid="snippet-integral"
          >
            ∫
          </button>
          <button
            type="button"
            onClick={handleInsertIndefiniteIntegral}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--dp-border, #666)",
              background: "var(--dp-surface, #111)",
              color: "inherit",
              cursor: "pointer",
            }}
            title="Insert indefinite integral"
            aria-label="Insert indefinite integral"
            data-testid="snippet-indef-integral"
          >
            ∫ dx
          </button>
          <button
            type="button"
            onClick={handleInsertPartialDerivative}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--dp-border, #666)",
              background: "var(--dp-surface, #111)",
              color: "inherit",
              cursor: "pointer",
            }}
            title="Insert partial derivative"
            aria-label="Insert partial derivative"
            data-testid="snippet-partial-derivative"
          >
            ∂/∂
          </button>
        </div>
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
