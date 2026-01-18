import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import type { SubstituteScope } from "../../substitute";
import { vecMacroOptions } from "../../infra/mathlive/vecMacroOptions";

type SubstituteModalProps = {
  open: boolean;
  selectedNodeLatex: string | null;
  substituteError: string;
  substituteScope: SubstituteScope;
  onScopeChange: (scope: SubstituteScope) => void;
  onSubmit: () => void;
  onClose: () => void;
  substituteFieldRef: RefObject<any>;
  MathField: any;
  MathDiv: any;
};

const useVecMacro = (
  enabled: boolean,
  elRef: RefObject<HTMLElement | null>,
  deps: ReadonlyArray<unknown> = []
) => {
  useEffect(() => {
    if (!enabled) return;
    const el = elRef.current as any;
    if (!el) return;
    el.setOptions?.(vecMacroOptions);
    el.render?.();
  }, [enabled, elRef, ...deps]);
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10000,
  padding: 16,
};

const modalCardStyle: CSSProperties = {
  width: "min(720px, 100%)",
  background: "rgb(10, 10, 10)",
  color: "inherit",
  border: "1px solid var(--dp-border)",
  borderRadius: 12,
  boxShadow: "0 16px 42px rgba(0,0,0,0.18)",
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const labelStyle: CSSProperties = { fontSize: 13, color: "var(--dp-muted)" };

export function SubstituteModal({
  open,
  selectedNodeLatex,
  substituteError,
  substituteScope,
  onScopeChange,
  onSubmit,
  onClose,
  substituteFieldRef,
  MathField,
  MathDiv,
}: SubstituteModalProps) {
  const selectedMathDivRef = useRef<HTMLElement | null>(null);
  useVecMacro(open, selectedMathDivRef, [selectedNodeLatex]);
  useVecMacro(open, substituteFieldRef as RefObject<HTMLElement | null>);

  if (!open) return null;

  return (
    <div style={modalOverlayStyle} role="dialog" aria-modal="true">
      <div style={modalCardStyle}>
        <h3 style={{ margin: 0 }}>Substitute</h3>
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 180, flex: "0 0 auto" }}>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Selected</div>
            <div
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--dp-border)",
                background: "var(--dp-surface)",
                minHeight: 40,
                display: "flex",
                alignItems: "center",
              }}
            >
              <MathDiv
                ref={selectedMathDivRef}
                mode="math"
                macros={JSON.stringify(vecMacroOptions.macros)}
                style={{
                  fontSize: "1.05rem",
                  minHeight: 28,
                }}
              >
                {selectedNodeLatex || "—"}
              </MathDiv>
            </div>
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "var(--dp-toolbar-fg, inherit)",
            }}
            aria-hidden
          >
            =
          </div>
          <div
            style={{
              flex: "1 1 280px",
              minWidth: 240,
              maxWidth: 420,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ ...labelStyle, marginBottom: 2 }}>
              Replace with (LaTeX)
            </div>
            <MathField
              ref={substituteFieldRef}
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid var(--dp-border)",
                borderRadius: 8,
              }}
              data-testid="substitute-input"
            />
            {substituteError ? (
              <div style={{ color: "#d32f2f", fontSize: 12 }}>
                {substituteError}
              </div>
            ) : null}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="sub-scope"
                value="single"
                checked={substituteScope === "single"}
                onChange={() => onScopeChange("single")}
              />
              This occurrence
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="sub-scope"
                value="all"
                checked={substituteScope === "all"}
                onChange={() => onScopeChange("all")}
              />
              All matching occurrences
            </label>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onSubmit}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--dp-border)",
                background: "var(--dp-active, #7c4dff)",
                color: "white",
                cursor: "pointer",
              }}
            >
              OK
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--dp-border)",
                background: "var(--dp-surface)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
