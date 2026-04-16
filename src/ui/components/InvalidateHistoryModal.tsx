import type { CSSProperties } from "react";

type InvalidateHistoryModalProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
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
  width: "min(520px, 100%)",
  background: "rgb(10, 10, 10)",
  color: "inherit",
  border: "1px solid var(--dp-border)",
  borderRadius: 12,
  boxShadow: "0 16px 42px rgba(0,0,0,0.18)",
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

export function InvalidateHistoryModal({
  open,
  onConfirm,
  onCancel,
}: InvalidateHistoryModalProps) {
  if (!open) return null;

  return (
    <div style={modalOverlayStyle} role="dialog" aria-modal="true">
      <div style={modalCardStyle}>
        <h3 style={{ margin: 0 }}>Discard later history?</h3>
        <p style={{ margin: 0, color: "var(--dp-muted)", lineHeight: 1.4 }}>
          You are editing from an earlier step. Continuing will discard all
          later redo steps.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--dp-border)",
              background: "var(--dp-active, #7c4dff)",
              color: "white",
              cursor: "pointer",
            }}
          >
            Discard and continue
          </button>
          <button
            type="button"
            onClick={onCancel}
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
