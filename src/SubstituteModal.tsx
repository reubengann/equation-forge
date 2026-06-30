import { useEffect, useRef, type CSSProperties } from "react";
import { DraggableModal } from "./DraggableModal";
import { MathEntry } from "./MathEntry";
import { StaticMath } from "./StaticMath";

type MathDivLike = HTMLElement & {
  value?: string;
  render?: () => void;
};

type SubstituteModalProps = {
  selectedLatex: string;
  selectedLabel?: string;
  selectedLatexReadonly?: boolean;
  replacementLatex: string;
  error: string | null;
  focusSession: number;
  suggestions?: Array<{
    equationId: string;
    label: string;
    rhsLatex: string;
  }>;
  onSuggestionSelected?: (suggestion: { equationId: string; label: string; rhsLatex: string }) => void;
  onSelectedLatexChange?: (nextLatex: string) => void;
  onReplacementLatexChange: (nextLatex: string) => void;
  onAccept: (latestLatex?: string) => void;
  onCancel: () => void;
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

const suggestionButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

export function SubstituteModal({
  selectedLatex,
  selectedLabel = "Selected expression",
  selectedLatexReadonly = true,
  replacementLatex,
  error,
  focusSession,
  suggestions = [],
  onSuggestionSelected,
  onSelectedLatexChange,
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

  return (
    <DraggableModal titleId="substitute-modal-title" title="Substitute" style={modalStyle} onCancel={onCancel}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={labelStyle}>{selectedLabel}</div>
          {selectedLatexReadonly ? (
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
          ) : (
            <MathEntry
              key={`target-${focusSession}`}
              latex={selectedLatex}
              onLatexChange={onSelectedLatexChange ?? (() => undefined)}
              onAccept={onAccept}
              autoFocus
              selectOnFocus
              focusSession={focusSession}
              mathFieldId="substitute-target-mathfield"
              macroButtonTabIndex={-1}
            />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={labelStyle}>Replace with</div>
          <MathEntry
            key={focusSession}
            latex={replacementLatex}
            onLatexChange={onReplacementLatexChange}
            onAccept={onAccept}
            autoFocus={selectedLatexReadonly}
            selectOnFocus={selectedLatexReadonly}
            focusSession={focusSession}
            mathFieldId="substitute-mathfield"
            macroButtonTabIndex={-1}
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
                  aria-label={`${suggestion.label}: ${suggestion.rhsLatex}`}
                  onClick={() => onSuggestionSelected?.(suggestion)}
                  style={suggestionButtonStyle}
                >
                  <span>{suggestion.label}:</span>
                  <StaticMath latex={suggestion.rhsLatex} style={{ fontSize: "1.05rem" }} />
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
    </DraggableModal>
  );
}
