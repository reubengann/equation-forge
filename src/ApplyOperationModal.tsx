import { useEffect, type CSSProperties } from "react";
import { MathEntry } from "./MathEntry";
import { MATH_ENTRY_MACROS, type MathEntryMacro } from "./mathEntry/mathEntryMacros";
import type { ApplyOperationTargetKind } from "./math/rewrite/applyOperation";

type ApplyOperationModalProps = {
  targetKind: ApplyOperationTargetKind;
  canSwitchInequality: boolean;
  switchInequality: boolean;
  placeholder: string;
  operationLatex: string;
  error: string | null;
  focusSession: number;
  onSwitchInequalityChange: (nextValue: boolean) => void;
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

const equationPlaceholderMacro: MathEntryMacro = {
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
};

const fractionPartPlaceholderMacro: MathEntryMacro = {
  id: "fraction-part-placeholder",
  label: "part",
  title: String.raw`Insert \part placeholder`,
  latex: String.raw`\part`,
  icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <text x="1" y="15" fill="currentColor" fontSize="8" fontWeight="700">
        part
      </text>
    </svg>
  ),
};

const relationOperationMacros: MathEntryMacro[] = [
  equationPlaceholderMacro,
  ...MATH_ENTRY_MACROS,
];

const fractionOperationMacros: MathEntryMacro[] = [
  fractionPartPlaceholderMacro,
  ...MATH_ENTRY_MACROS,
];

const operationMathfieldMacros = {
  eqn: String.raw`\mathord{\mathrm{eqn}}`,
  part: String.raw`\mathord{\mathrm{part}}`,
};

export function ApplyOperationModal({
  targetKind,
  canSwitchInequality,
  switchInequality,
  placeholder,
  operationLatex,
  error,
  focusSession,
  onSwitchInequalityChange,
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

  const operationMacros = targetKind === "relation" ? relationOperationMacros : fractionOperationMacros;
  const placeholderLatex = `\\${placeholder}`;
  const currentPartName = targetKind === "relation" ? "side" : "numerator/denominator";
  const exampleLatex =
    targetKind === "relation"
      ? { reciprocal: String.raw`1/\eqn`, root: String.raw`\sqrt{\eqn}` }
      : { reciprocal: String.raw`1/\part`, root: String.raw`\sqrt{\part}` };

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
            Use <code>{placeholderLatex}</code> where each current {currentPartName} should be inserted,
            for example <code>{exampleLatex.reciprocal}</code> or <code>{exampleLatex.root}</code>.
          </div>
          {canSwitchInequality && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.9rem",
                color: "rgba(255, 255, 255, 0.82)",
              }}
            >
              <input
                type="checkbox"
                checked={switchInequality}
                onChange={(event) => onSwitchInequalityChange(event.currentTarget.checked)}
              />
              Switch inequality symbol
            </label>
          )}
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
