import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ExpressionPad,
  type ExpressionPadSnapshot,
} from "../ui/components/ExpressionPad";
import { IconButton } from "../ui/components/IconButton";
import "../App.css";

type Pad = { id: string; snapshot?: ExpressionPadSnapshot };

const materialSymbolStyle: CSSProperties = {
  fontVariationSettings: `"FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24`,
  fontFamily: `"Material Symbols Rounded"`,
  fontWeight: "normal",
  fontStyle: "normal",
  fontSize: 22,
  lineHeight: 1,
};

const sideControlStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 4,
  border: "1px solid var(--dp-border)",
  borderRadius: 10,
  background: "var(--dp-surface)",
  alignItems: "center",
};

export function DerivationPage() {
  const storageKey = "derivation-pads";

  const loadFromStorage = () => {
    const fallback = { pads: [{ id: "pad-1" }] as Pad[], counter: 2 };
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Pad[];
      if (!Array.isArray(parsed) || parsed.length === 0) return fallback;
      const maxNum = parsed
        .map((p) => Number(p.id.split("-")[1] ?? "0"))
        .reduce((a, b) => (Number.isFinite(b) ? Math.max(a, b) : a), 1);
      return { pads: parsed, counter: maxNum + 1 };
    } catch {
      return fallback;
    }
  };

  const { pads: initialPads, counter: initialCounter } = useMemo(
    loadFromStorage,
    []
  );

  const [pads, setPads] = useState<Pad[]>(initialPads);
  const [idCounter, setIdCounter] = useState(initialCounter);
  const [scrollToPadId, setScrollToPadId] = useState<string | null>(null);

  // Persist whenever pads change
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(pads));
    } catch {
      // storage may be unavailable; ignore
    }
  }, [pads]);

  useEffect(() => {
    if (!scrollToPadId) return;
    if (typeof document === "undefined") return;
    const el = document.querySelector<HTMLElement>(
      `[data-pad-id="${CSS.escape(scrollToPadId)}"]`
    );
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "end" });
      setScrollToPadId(null);
    });
  }, [pads, scrollToPadId]);

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

  function duplicatePadToBottom(id: string) {
    const newId = `pad-${idCounter}`;
    setPads((prev) => {
      const source = prev.find((p) => p.id === id);
      if (!source) return prev;
      return [...prev, { id: newId, snapshot: source.snapshot }];
    });
    setScrollToPadId(newId);
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

  function movePadToBottom(id: string) {
    setPads((prev) => {
      const index = prev.findIndex((p) => p.id === id);
      if (index === -1 || index === prev.length - 1) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.push(item);
      return next;
    });
  }

  function updateSnapshot(id: string, snapshot: ExpressionPadSnapshot) {
    setPads((prev) =>
      prev.map((p) => (p.id === id ? { ...p, snapshot } : p))
    );
  }

  function clearAll() {
    setPads([{ id: "pad-1" }]);
    setIdCounter(2);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // ignore storage issues
    }
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
          position: "sticky",
          top: 8,
          zIndex: 20,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Derivation pads</div>
          <div style={{ fontSize: 13, color: "var(--dp-muted)" }}>
            Add, remove, duplicate, or reorder pads for your derivation steps.
            State is saved locally.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          <button
            type="button"
            onClick={clearAll}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid var(--dp-border)",
              background: "var(--dp-surface)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Clear all
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {pads.map((pad, idx) => (
          <div
            key={pad.id}
            data-pad-id={pad.id}
            style={{
              border: "1px solid var(--dp-border)",
              borderRadius: 12,
              boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
              background: "var(--dp-surface)",
              padding: 8,
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={sideControlStyle}>
              <IconButton
                label="Move pad up"
                icon={<span style={materialSymbolStyle}>arrow_upward</span>}
                onClick={() => movePad(pad.id, "up")}
                disabled={idx === 0}
                testId={`pad-${idx + 1}-up`}
              />
              <IconButton
                label="Move pad down"
                icon={<span style={materialSymbolStyle}>arrow_downward</span>}
                onClick={() => movePad(pad.id, "down")}
                disabled={idx === pads.length - 1}
                testId={`pad-${idx + 1}-down`}
              />
              <IconButton
                label="Move pad to bottom"
                icon={<span style={materialSymbolStyle}>vertical_align_bottom</span>}
                onClick={() => movePadToBottom(pad.id)}
                disabled={idx === pads.length - 1}
                testId={`pad-${idx + 1}-to-bottom`}
              />
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                gap: 8,
              }}
            >
              <ExpressionPad
                key={pad.id}
                initialSnapshot={pad.snapshot}
                onSnapshot={(snapshot) => updateSnapshot(pad.id, snapshot)}
                otherPadSnapshots={pads.flatMap((p, pIdx) =>
                  pIdx === idx || !p.snapshot
                    ? []
                    : [{ padIndex: pIdx + 1, snapshot: p.snapshot }]
                )}
              />
              <span
                style={{
                  fontSize: 13,
                  color: "var(--dp-muted)",
                  padding: "2px 6px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.06)",
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                }}
              >
                ({idx + 1})
              </span>
            </div>
            <div style={{ ...sideControlStyle, gap: 8 }}>
              <IconButton
                label="Duplicate pad"
                icon={<span style={materialSymbolStyle}>content_copy</span>}
                onClick={() => duplicatePad(pad.id)}
                testId={`pad-${idx + 1}-duplicate`}
              />
              <IconButton
                label="Duplicate to bottom"
                icon={<span style={materialSymbolStyle}>vertical_align_bottom</span>}
                onClick={() => duplicatePadToBottom(pad.id)}
                testId={`pad-${idx + 1}-duplicate-to-bottom`}
              />
              <IconButton
                label="Remove pad"
                icon={<span style={materialSymbolStyle}>delete</span>}
                onClick={() => removePad(pad.id)}
                testId={`pad-${idx + 1}-remove`}
              />
            </div>
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
