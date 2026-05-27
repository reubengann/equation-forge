import { useEffect, type CSSProperties } from "react";
import { MathEntry } from "./MathEntry";
import type { MathEntryMacro } from "./mathEntry/mathEntryMacros";

type ApplyOperationModalProps = {
  operationLatex: string;
  error: string | null;
  focusSession: number;
  onOperationLatexChange: (nextLatex: string) => void;
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

const actionButtonStyle: CSSProperties = {
  minWidth: 88,
  padding: "8px 14px",
  border: "1px solid #757575",
  borderRadius: 3,
  background: "#424242",
  color: "rgba(255, 255, 255, 0.87)",
  cursor: "pointer",
};

const operationMacros: MathEntryMacro[] = [
  {
    id: "equation-placeholder",
    label: "eqn",
    title: String.raw`Insert \eqn placeholder`,
    latex: String.raw`\eqn`,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <text x="2" y="15" fill="currentColor" fontSize="8" fontWeight="700">
          eqn
        </text>
      </svg>
    ),
  },
];

const operationMathfieldMacros = {
  eqn: String.raw`\mathord{\mathrm{eqn}}`,
};

export function ApplyOperationModal({
  operationLatex,
  error,
  focusSession,
  onOperationLatexChange,
  onAccept,
  onCancel,
}: ApplyOperationModalProps) {
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
    <div role="dialog" aria-modal="true" aria-labelledby="apply-operation-modal-title" style={overlayStyle}>
      <div style={modalStyle}>
        <h2 id="apply-operation-modal-title" style={{ margin: 0, fontSize: "1.15rem" }}>
          Apply Operation
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={labelStyle}>Operation template</div>
          <MathEntry
            key={focusSession}
            latex={operationLatex}
            onLatexChange={onOperationLatexChange}
            onAccept={onAccept}
            macros={operationMacros}
            mathfieldMacros={operationMathfieldMacros}
            autoFocus
            focusSession={focusSession}
            mathFieldId="apply-operation-mathfield"
          />
          <div style={{ fontSize: "0.85rem", color: "rgba(255, 255, 255, 0.62)" }}>
            Use <code>{String.raw`\eqn`}</code> where each current side should be inserted, for example{" "}
            <code>{String.raw`1/\eqn`}</code> or <code>{String.raw`\sqrt{\eqn}`}</code>.
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
      </div>
    </div>
  );
}
