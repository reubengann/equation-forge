import type { RefObject } from "react";
import { useEffect } from "react";

type EquationEditorProps = {
  slotRef: RefObject<HTMLDivElement | null>;
  mathDivRef: RefObject<HTMLElement | null>;
  latex: string;
  selectedNodeId: string | null;
  onSelectionChange: (nodeId: string | null) => void;
  onNodeClick: (nodeId: string | null, clickCount: number) => void;
  onPointerDownEvent: (payload: {
    nodeId: string | null;
    x: number;
    y: number;
    pointerType: string;
    button: number;
    buttons: number;
  }) => void;
  onPointerUpEvent: (payload: {
    nodeId: string | null;
    x: number;
    y: number;
    pointerType: string;
    button: number;
    buttons: number;
  }) => void;
};

function pickNodeIdAtPoint(
  shadowRoot: ShadowRoot,
  clientX: number,
  clientY: number,
): string | null {
  const els = Array.from(
    shadowRoot.querySelectorAll<HTMLElement>("[data-node-id]"),
  );
  let best: { id: string; area: number } | null = null;
  for (const el of els) {
    const nodeId = el.dataset.nodeId;
    if (!nodeId) continue;
    const rect = el.getBoundingClientRect();
    const contains =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    if (!contains) continue;
    const area = Math.max(
      1,
      (rect.right - rect.left) * (rect.bottom - rect.top),
    );
    if (!best || area < best.area) {
      best = { id: nodeId, area };
    }
  }
  return best?.id ?? null;
}

export function EquationEditor({
  slotRef,
  mathDivRef,
  latex,
  selectedNodeId,
  onSelectionChange,
  onNodeClick,
  onPointerDownEvent,
  onPointerUpEvent,
}: EquationEditorProps) {
  useEffect(() => {
    const host = mathDivRef.current as
      | (HTMLElement & { shadowRoot?: ShadowRoot | null })
      | null;
    const shadowRoot = host?.shadowRoot;
    if (!shadowRoot) return;

    const els = Array.from(
      shadowRoot.querySelectorAll<HTMLElement>("[data-node-id]"),
    );
    for (const el of els) {
      const nodeId = el.dataset.nodeId;
      const isSelected = !!selectedNodeId && nodeId === selectedNodeId;
      el.style.outline = isSelected ? "1px solid #64b5f6" : "";
      el.style.outlineOffset = isSelected ? "1px" : "";
      el.style.background = isSelected ? "rgba(100, 181, 246, 0.15)" : "";
    }
  }, [mathDivRef, latex, selectedNodeId]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const host = mathDivRef.current as
      | (HTMLElement & { shadowRoot?: ShadowRoot | null })
      | null;
    const shadowRoot = host?.shadowRoot;
    if (!shadowRoot) {
      onPointerDownEvent({
        nodeId: null,
        x: event.clientX,
        y: event.clientY,
        pointerType: event.pointerType,
        button: event.button,
        buttons: event.buttons,
      });
      onSelectionChange(null);
      return;
    }
    const nodeId = pickNodeIdAtPoint(shadowRoot, event.clientX, event.clientY);
    onPointerDownEvent({
      nodeId,
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
    });
    onSelectionChange(nodeId);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const host = mathDivRef.current as
      | (HTMLElement & { shadowRoot?: ShadowRoot | null })
      | null;
    const shadowRoot = host?.shadowRoot;
    const nodeId = shadowRoot
      ? pickNodeIdAtPoint(shadowRoot, event.clientX, event.clientY)
      : null;
    onPointerUpEvent({
      nodeId,
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
    });
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const host = mathDivRef.current as
      | (HTMLElement & { shadowRoot?: ShadowRoot | null })
      | null;
    const shadowRoot = host?.shadowRoot;
    if (!shadowRoot) {
      onNodeClick(null, event.detail || 1);
      return;
    }
    const nodeId = pickNodeIdAtPoint(shadowRoot, event.clientX, event.clientY);
    onNodeClick(nodeId, event.detail || 1);
  };

  return (
    <div
      ref={slotRef}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={onClick}
      style={{
        flex: 1,
        boxSizing: "border-box",
        borderRadius: "3px",
        color: "rgba(255, 255, 255, 1.0)",
        padding: "16px",
        textAlign: "left",
        display: "flex",
      }}
    >
      <math-div
        ref={mathDivRef}
        data-testid="math-div-output"
        mode="displaystyle"
        value={latex}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
        }}
      />
    </div>
  );
}
