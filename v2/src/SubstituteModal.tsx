import { useEffect, useRef, type CSSProperties } from "react";
import { MathEntry } from "./MathEntry";

type MathDivLike = HTMLElement & {
  value?: string;
  render?: () => void;
};

type SubstituteModalProps = {
  selectedLatex: string;
  replacementLatex: string;
  error: string | null;
  focusSession: number;
  suggestions?: Array<{
    equationId: string;
    label: string;
    rhsLatex: string;
  }>;
  onSuggestionSelected?: (suggestion: { equationId: string; label: string; rhsLatex: string }) => void;
  onReplacementLatexChange: (nextLatex: string) => void;
  onAccept: (latestLatex?: string) => void;
  onCancel: () => void;
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  background: "rgba(0, 0, 0, 0.35)",
};

const modalStyle: CSSProperties = {
  width: "min(760px, 100%)",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: 20,
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderTopStyle: "solid",
  borderRightStyle: "solid",
  borderBottomStyle: "solid",
  borderLeftStyle: "solid",
  borderTopColor: "#757575",
  borderRightColor: "#757575",
  borderBottomColor: "#757575",
  borderLeftColor: "#757575",
  borderRadius: 8,
  background: "#242424",
  color: "rgba(255, 255, 255, 0.87)",
  boxShadow: "0 16px 42px rgba(0, 0, 0, 0.35)",
};

const labelStyle: CSSProperties = {
  fontSize: "0.9rem",
  color: "rgba(255, 255, 255, 0.7)",
};

const selectedExpressionStyle: CSSProperties = {
  minHeight: 48,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  padding: "10px 12px",
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderTopStyle: "solid",
  borderRightStyle: "solid",
  borderBottomStyle: "solid",
  borderLeftStyle: "solid",
  borderTopColor: "#757575",
  borderRightColor: "#757575",
  borderBottomColor: "#757575",
  borderLeftColor: "#757575",
  borderRadius: 3,
  background: "#1f1f1f",
};

const actionButtonStyle: CSSProperties = {
  minWidth: 88,
  padding: "8px 14px",
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderTopStyle: "solid",
  borderRightStyle: "solid",
  borderBottomStyle: "solid",
  borderLeftStyle: "solid",
  borderTopColor: "#757575",
  borderRightColor: "#757575",
  borderBottomColor: "#757575",
  borderLeftColor: "#757575",
  borderRadius: 3,
  background: "#424242",
  color: "rgba(255, 255, 255, 0.87)",
  cursor: "pointer",
};

export function SubstituteModal({
  selectedLatex,
  replacementLatex,
  error,
  focusSession,
  suggestions = [],
  onSuggestionSelected,
  onReplacementLatexChange,
  onAccept,
  onCancel,
}: SubstituteModalProps) {
  const selectedMathRef = useRef<MathDivLike | null>(null);

  useEffect(() => {
    const selectedMath = selectedMathRef.current;
    if (!selectedMath) return;
    selectedMath.value = selectedLatex;
    selectedMath.setAttribute("value", selectedLatex);
    selectedMath.textContent = selectedLatex;
    selectedMath.render?.();
  }, [selectedLatex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="substitute-modal-title" style={overlayStyle}>
      <div style={modalStyle}>
        <h2 id="substitute-modal-title" style={{ margin: 0, fontSize: "1.15rem" }}>
          Substitute
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={labelStyle}>Selected expression</div>
          <div style={selectedExpressionStyle}>
            <math-div
              ref={(element) => {
                selectedMathRef.current = element as MathDivLike | null;
              }}
              data-testid="substitute-selected-expression"
              mode="displaystyle"
              value={selectedLatex}
              style={{ display: "block", width: "100%", fontSize: "1.15rem" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={labelStyle}>Replace with</div>
          <MathEntry
            key={focusSession}
            latex={replacementLatex}
            onLatexChange={onReplacementLatexChange}
            onAccept={onAccept}
            autoFocus
            focusSession={focusSession}
            mathFieldId="substitute-mathfield"
          />
          {error && (
            <div role="alert" style={{ color: "#ffb4ab", fontSize: "0.9rem", lineHeight: 1.35 }}>
              {error}
            </div>
          )}
        </div>

        {suggestions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={labelStyle}>Use definition from another equation</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.equationId}
                  type="button"
                  data-testid={`substitute-suggestion-${suggestion.equationId}`}
                  onClick={() => onSuggestionSelected?.(suggestion)}
                  style={actionButtonStyle}
                >
                  {suggestion.label}: {suggestion.rhsLatex}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" onClick={onCancel} style={actionButtonStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onAccept()}
            style={{
              ...actionButtonStyle,
              background: "#7c4dff",
              borderTopColor: "#7c4dff",
              borderRightColor: "#7c4dff",
              borderBottomColor: "#7c4dff",
              borderLeftColor: "#7c4dff",
            }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
