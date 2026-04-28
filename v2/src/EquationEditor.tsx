import type { RefObject } from "react";
import { useEffect } from "react";

type EquationEditorProps = {
  mathDivRef: RefObject<HTMLElement | null>;
  latex: string;
  selectedNodeId: string | null;
  onNodeClick: (payload: { x: number; y: number; clickCount: number }) => void;
  onPointerDownEvent: (payload: {
    x: number;
    y: number;
    pointerType: string;
    button: number;
    buttons: number;
  }) => void;
  onPointerUpEvent: (payload: {
    x: number;
    y: number;
    pointerType: string;
    button: number;
    buttons: number;
  }) => void;
};

export function EquationEditor({
  mathDivRef,
  latex,
  selectedNodeId,
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
    onPointerDownEvent({
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    onPointerUpEvent({
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
    });
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    onNodeClick({
      x: event.clientX,
      y: event.clientY,
      clickCount: event.detail || 1,
    });
  };

  return (
    <div
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
