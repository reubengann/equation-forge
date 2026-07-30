import { useEffect, useRef, type CSSProperties } from "react";
import { DraggableModal } from "./DraggableModal";
import { MathEntry } from "./MathEntry";
import type { ReplaceableSymbol } from "@physics-derivation-pad/core/rewrite";

type MathDivLike = HTMLElement & {
  value?: string;
  render?: () => void;
};

export type SymbolReplacementDraft = {
  key: string;
  source: ReplaceableSymbol;
  enabled: boolean;
  replacementLatex: string;
};

type SymbolReplacementModalProps = {
  rows: SymbolReplacementDraft[];
  error: string | null;
  focusSession: number;
  onRowEnabledChange: (key: string, enabled: boolean) => void;
  onReplacementLatexChange: (key: string, latex: string) => void;
  onAccept: () => void;
  onCancel: () => void;
};

const modalStyle: CSSProperties = {
  width: "min(920px, 100%)",
  maxHeight: "min(860px, calc(100vh - 32px))",
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

const symbolPreviewStyle: CSSProperties = {
  minHeight: 48,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  padding: "10px 12px",
  border: "1px solid #757575",
  borderRadius: 3,
  background: "#1f1f1f",
};

function SymbolPreview({ latex }: { latex: string }) {
  const mathRef = useRef<MathDivLike | null>(null);

  useEffect(() => {
    const math = mathRef.current;
    if (!math) return;
    math.value = latex;
    math.setAttribute("value", latex);
    math.textContent = latex;
    math.render?.();
  }, [latex]);

  return (
    <div style={symbolPreviewStyle}>
      <math-div
        ref={(element) => {
          mathRef.current = element as MathDivLike | null;
        }}
        mode="displaystyle"
        value={latex}
        style={{ display: "block", width: "100%", fontSize: "1.1rem" }}
      />
    </div>
  );
}

export function SymbolReplacementModal({
  rows,
  error,
  focusSession,
  onRowEnabledChange,
  onReplacementLatexChange,
  onAccept,
  onCancel,
}: SymbolReplacementModalProps) {
  return (
    <DraggableModal
      titleId="symbol-replacement-modal-title"
      title="Replace Symbols"
      style={modalStyle}
      onCancel={onCancel}
    >
        <div style={labelStyle}>Select symbols to replace. All checked replacements are applied at the same time.</div>

        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4 }}>
          {rows.map((row, index) => (
            <div
              key={row.key}
              style={{
                display: "grid",
                gridTemplateColumns: "32px minmax(120px, 180px) 1fr",
                gap: 10,
                alignItems: "stretch",
              }}
            >
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(event) => onRowEnabledChange(row.key, event.currentTarget.checked)}
                  aria-label={`Replace ${row.source.latex}`}
                />
              </label>
              <SymbolPreview latex={row.source.latex} />
              <MathEntry
                key={`${row.key}-${focusSession}`}
                latex={row.replacementLatex}
                onLatexChange={(latex) => onReplacementLatexChange(row.key, latex)}
                onAccept={onAccept}
                autoFocus={index === 0}
                focusSession={focusSession}
                mathFieldId={`symbol-replacement-${index}`}
                macroButtonTabIndex={-1}
              />
            </div>
          ))}
        </div>

        {error && (
          <div role="alert" style={{ color: "#ffb4ab", fontSize: "0.9rem", lineHeight: 1.35 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" onClick={onCancel} style={actionButtonStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onAccept}
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
