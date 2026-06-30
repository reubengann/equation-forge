import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

type DraggableModalProps = {
  titleId: string;
  title: string;
  style: CSSProperties;
  onCancel: () => void;
  children: ReactNode;
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

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.15rem",
  cursor: "move",
  userSelect: "none",
  touchAction: "none",
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

export function DraggableModal({ titleId, title, style, onCancel, children }: DraggableModalProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }

      const modal = modalRef.current;
      const target = event.target;
      if (modal && target instanceof Node && modal.contains(target)) return;

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
  }, [onCancel]);

  const onModalKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const onTitlePointerDown = (event: PointerEvent<HTMLHeadingElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const onTitlePointerMove = (event: PointerEvent<HTMLHeadingElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  };

  const finishDrag = (event: PointerEvent<HTMLHeadingElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={overlayStyle}>
      <div
        ref={modalRef}
        onKeyDown={onModalKeyDown}
        style={{
          ...style,
          transform: `translate(${offset.x}px, ${offset.y}px)`,
        }}
      >
        <h2
          id={titleId}
          title="Drag to move"
          style={titleStyle}
          onPointerDown={onTitlePointerDown}
          onPointerMove={onTitlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
