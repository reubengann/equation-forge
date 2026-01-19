import { useState } from "react";
import {
  ExpressionPad,
  type ExpressionPadSnapshot,
} from "../ui/components/ExpressionPad";
import "../App.css";

type Pad = { id: string; snapshot?: ExpressionPadSnapshot };

export function DerivationPage() {
  const [pads, setPads] = useState<Pad[]>([{ id: "pad-1" }]);
  const [idCounter, setIdCounter] = useState(2);

  function addPad() {
    setPads((prev) => [...prev, { id: `pad-${idCounter}` }]);
    setIdCounter((c) => c + 1);
  }

  function removePad(id: string) {
    setPads((prev) => prev.filter((p) => p.id !== id));
  }

  function duplicatePad(id: string) {
    setPads((prev) => {
      const index = prev.findIndex((p) => p.id === id);
      if (index === -1) return prev;
      const source = prev[index];
      const newPad: Pad = { id: `pad-${idCounter}`, snapshot: source.snapshot };
      const next = [...prev];
      next.splice(index + 1, 0, newPad);
      return next;
    });
    setIdCounter((c) => c + 1);
  }

  function movePad(id: string, direction: "up" | "down") {
    setPads((prev) => {
      const index = prev.findIndex((p) => p.id === id);
      if (index === -1) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  }

  function updateSnapshot(id: string, snapshot: ExpressionPadSnapshot) {
    setPads((prev) =>
      prev.map((p) => (p.id === id ? { ...p, snapshot } : p))
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "8px 12px",
          borderRadius: 12,
          border: "1px solid var(--dp-border)",
          background: "var(--dp-surface)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Derivation pads</div>
          <div style={{ fontSize: 13, color: "var(--dp-muted)" }}>
            Add, remove, or reorder pads for your derivation steps.
          </div>
        </div>
        <button
          type="button"
          onClick={addPad}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid var(--dp-border)",
            background: "var(--dp-surface)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Add pad
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {pads.map((pad, idx) => (
          <div
            key={pad.id}
            style={{
              border: "1px solid var(--dp-border)",
              borderRadius: 12,
              boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
              background: "var(--dp-surface)",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 600 }}>Pad {idx + 1}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => movePad(pad.id, "up")}
                  disabled={idx === 0}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--dp-border)",
                    background: "var(--dp-surface)",
                    cursor: idx === 0 ? "not-allowed" : "pointer",
                    opacity: idx === 0 ? 0.5 : 1,
                  }}
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => movePad(pad.id, "down")}
                  disabled={idx === pads.length - 1}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--dp-border)",
                    background: "var(--dp-surface)",
                    cursor: idx === pads.length - 1 ? "not-allowed" : "pointer",
                    opacity: idx === pads.length - 1 ? 0.5 : 1,
                  }}
                >
                  Down
                </button>
                <button
                  type="button"
                  onClick={() => duplicatePad(pad.id)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--dp-border)",
                    background: "var(--dp-surface)",
                    cursor: "pointer",
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => removePad(pad.id)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--dp-border)",
                    background: "var(--dp-surface)",
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
            <ExpressionPad
              key={pad.id}
              initialSnapshot={pad.snapshot}
              onSnapshot={(snapshot) => updateSnapshot(pad.id, snapshot)}
            />
          </div>
        ))}
        {pads.length === 0 ? (
          <div
            style={{
              border: "1px dashed var(--dp-border)",
              borderRadius: 10,
              padding: 16,
              color: "var(--dp-muted)",
              textAlign: "center",
            }}
          >
            No pads yet. Click &ldquo;Add pad&rdquo; to start.
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default DerivationPage;
