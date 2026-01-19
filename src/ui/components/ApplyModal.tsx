import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { vecMacroOptions } from "../../infra/mathlive/vecMacroOptions";

type ApplyModalProps = {
  open: boolean;
  equationLatex: string | null;
  applyError: string;
  onSubmit: () => void;
  onClose: () => void;
  applyFieldRef: RefObject<any>;
  MathField: any;
  MathDiv: any;
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

const helperStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--dp-muted)",
  lineHeight: 1.4,
};

export function ApplyModal({
  open,
  equationLatex,
  applyError,
  onSubmit,
  onClose,
  applyFieldRef,
  MathField,
  MathDiv,
}: ApplyModalProps) {
  const equationRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const el = equationRef.current as any;
    el?.render?.();
  }, [open, equationLatex]);

  useEffect(() => {
    if (open && applyFieldRef.current) {
      const field = applyFieldRef.current as any;
      field.value = "";
      field.focus();
    }
  }, [open, applyFieldRef]);

  if (!open) return null;

  return (
    <div style={modalOverlayStyle} role="dialog" aria-modal="true">
      <div style={modalCardStyle}>
        <h3 style={{ margin: 0 }}>Apply to both sides</h3>
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 200, flex: "0 0 auto" }}>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Current equation</div>
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
                ref={(el: any) => {
                  equationRef.current = el;
                  if (el) el.macros = JSON.stringify(vecMacroOptions.macros);
                }}
                mode="math"
                macros={JSON.stringify(vecMacroOptions.macros)}
                style={{ fontSize: "1.05rem", minHeight: 28 }}
              >
                {equationLatex || "—"}
              </MathDiv>
            </div>
          </div>

          <div
            style={{
              flex: "1 1 320px",
              minWidth: 240,
              maxWidth: 420,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ ...labelStyle, marginBottom: 2 }}>Operation (LaTeX)</div>
            {/* MathLive note: use the macros prop, not element mutation/setOptions,
                to avoid the extra-parenthesis bug while still honoring \vec. */}
            <MathField
              ref={(el: any) => {
                applyFieldRef.current = el;
              }}
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid var(--dp-border)",
                borderRadius: 8,
              }}
              data-testid="apply-input"
              macros={vecMacroOptions.macros}
            />
            <div style={helperStyle}>
              Use <code>eqn</code> to refer to each side. Examples:{" "}
              <code>eqn^2</code>, <code>2 eqn</code>, <code>\\sin eqn</code>.
            </div>
            {applyError ? (
              <div style={{ color: "#d32f2f", fontSize: 12 }}>{applyError}</div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
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
  );
}
