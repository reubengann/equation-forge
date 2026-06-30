import { useEffect, useRef, type CSSProperties } from "react";
import { DraggableModal } from "./DraggableModal";
import { MathEntry } from "./MathEntry";

type MathDivLike = HTMLElement & {
  value?: string;
  render?: () => void;
};

type ForceFactorModalProps = {
  selectedLatex: string;
  factorLatex: string;
  error: string | null;
  focusSession: number;
  onFactorLatexChange: (nextLatex: string) => void;
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
  border: "1px solid #757575",
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
  border: "1px solid #757575",
  borderRadius: 3,
  background: "#1f1f1f",
};

const actionButtonStyle: CSSProperties = {
  minWidth: 88,
  padding: "8px 14px",
  border: "1px solid #757575",
  borderRadius: 3,
  background: "#424242",
  color: "rgba(255, 255, 255, 0.87)",
  cursor: "pointer",
};

export function ForceFactorModal({
  selectedLatex,
  factorLatex,
  error,
  focusSession,
  onFactorLatexChange,
  onAccept,
  onCancel,
}: ForceFactorModalProps) {
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
    <DraggableModal titleId="force-factor-modal-title" title="Force Factor" style={modalStyle} onCancel={onCancel}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={labelStyle}>Selected sum</div>
          <div style={selectedExpressionStyle}>
            <math-div
              ref={(element) => {
                selectedMathRef.current = element as MathDivLike | null;
              }}
              data-testid="force-factor-selected-expression"
              mode="displaystyle"
              value={selectedLatex}
              style={{ display: "block", width: "100%", fontSize: "1.15rem" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={labelStyle}>Factor to pull out</div>
          <MathEntry
            key={focusSession}
            latex={factorLatex}
            onLatexChange={onFactorLatexChange}
            onAccept={onAccept}
            autoFocus
            focusSession={focusSession}
            mathFieldId="force-factor-mathfield"
            macroButtonTabIndex={-1}
          />
          <div style={{ fontSize: "0.85rem", color: "rgba(255, 255, 255, 0.62)" }}>
            Use a simple product, power, or fraction, for example <code>\frac{"{1}{2}"}</code> or{" "}
            <code>a b</code>.
          </div>
          {error && (
            <div role="alert" style={{ color: "#ffb4ab", fontSize: "0.9rem", lineHeight: 1.35 }}>
              {error}
            </div>
          )}
        </div>

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
              borderColor: "#7c4dff",
            }}
          >
            Accept
          </button>
        </div>
    </DraggableModal>
  );
}
