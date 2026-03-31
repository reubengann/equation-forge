import type {
  CSSProperties,
  ReactNode,
  RefObject,
  KeyboardEvent,
} from "react";
import { vecMacroOptions } from "../../infra/mathlive/vecMacroOptions";

type MathDisplayPanelProps = {
  renderBoxRef: RefObject<HTMLDivElement | null>;
  mathWrapRef: RefObject<HTMLDivElement | null>;
  displayRef: RefObject<HTMLElement | null>;
  insertOverlayRef: RefObject<HTMLDivElement | null>;
  debugOverlayRef: RefObject<HTMLDivElement | null>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  renderHeader: ReactNode;
  isDragging: boolean;
  marqueeRect: { left: number; top: number; width: number; height: number } | null;
  MathDiv: any;
};

const renderHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  marginBottom: 4,
  flexWrap: "wrap",
};

export function MathDisplayPanel({
  renderBoxRef,
  mathWrapRef,
  displayRef,
  insertOverlayRef,
  debugOverlayRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  renderHeader,
  isDragging,
  marqueeRect,
  MathDiv,
}: MathDisplayPanelProps) {
  return (
    <div
      ref={renderBoxRef}
      style={{
        border: "1px solid var(--dp-border)",
        background: "var(--dp-surface)",
        padding: "8px 14px 14px",
        borderRadius: 10,
        cursor: isDragging ? "default" : "crosshair",
        userSelect: "none",
        position: "relative",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div style={renderHeaderStyle}>
        <div aria-label="Rendered output" />
        {renderHeader}
      </div>

      <div
        ref={mathWrapRef}
        style={{ position: "relative", display: "inline-block" }}
      >
        <div style={{ position: "relative" }}>
          {/* MathLive expects the display macros as a stringified attribute.
              Using the prop here is safe; changing macros at runtime via
              setOptions/macros mutation caused JSON parse warnings. */}
          <MathDiv
            ref={displayRef}
            mode="displaystyle"
            className="math-display"
            data-testid="math-display"
            macros={JSON.stringify(vecMacroOptions.macros)}
            style={{ fontSize: "1.2rem" }}
          />
          {/* Insert marker overlay */}
          <div
            ref={insertOverlayRef}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              pointerEvents: "none",
              zIndex: 9998,
            }}
          />
          {/* Debug overlay */}
          <div
            ref={debugOverlayRef}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              pointerEvents: "none",
              zIndex: 9999,
            }}
          />
        </div>
      </div>
      {marqueeRect ? (
        <div
          style={{
            position: "absolute",
            left: marqueeRect.left,
            top: marqueeRect.top,
            width: marqueeRect.width,
            height: marqueeRect.height,
            border: "1px dashed var(--dp-accent)",
            background: "rgba(64, 144, 255, 0.16)",
            pointerEvents: "none",
            zIndex: 10000,
          }}
        />
      ) : null}
    </div>
  );
}
