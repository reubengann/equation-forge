import type { CSSProperties } from "react";
import type { MoveType } from "./math/rewrite/types";

type EquationToolbarProps = {
  moveType: MoveType;
  onMoveTypeChanged: (nextMoveType: MoveType) => void;
  canUndo: boolean;
  onUndoRequested?: () => void;
  canRedo: boolean;
  onRedoRequested?: () => void;
  canFlip: boolean;
  onFlipRelationRequested: () => void;
  canSubstitute: boolean;
  onSubstituteRequested: () => void;
  canFactor: boolean;
  onFactorRequested: () => void;
  canDistribute: boolean;
  onDistributeRequested: () => void;
  canCleanup: boolean;
  onCleanupRequested: () => void;
};

const iconButtonBaseStyle: CSSProperties = {
  width: 36,
  height: 36,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderTopStyle: "solid",
  borderRightStyle: "solid",
  borderBottomStyle: "solid",
  borderLeftStyle: "solid",
  borderTopColor: "#757575",
  borderRightColor: "#757575",
  borderBottomColor: "#757575",
  borderLeftColor: "#757575",
  background: "#424242",
  color: "rgba(255, 255, 255, 0.87)",
  cursor: "pointer",
};

const iconButtonActiveStyle: CSSProperties = {
  borderTopColor: "#7c4dff",
  borderRightColor: "#7c4dff",
  borderBottomColor: "#7c4dff",
  borderLeftColor: "#7c4dff",
  color: "#7c4dff",
  background: "rgba(124, 77, 255, 0.14)",
  boxShadow: "0 0 0 1px rgba(124, 77, 255, 0.3)",
};

const iconButtonDisabledStyle: CSSProperties = {
  opacity: 0.45,
  cursor: "not-allowed",
};

const toolbarGroupStyle: CSSProperties = {
  display: "flex",
  border: "1px solid #757575",
  borderRadius: "3px",
  overflow: "hidden",
};

const materialSymbolStyle: CSSProperties = {
  fontVariationSettings: `"FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24`,
  fontFamily: `"Material Symbols Rounded"`,
  fontWeight: "normal",
  fontStyle: "normal",
  fontSize: 22,
  lineHeight: 1,
  letterSpacing: "normal",
  textTransform: "none",
  display: "inline-block",
  whiteSpace: "nowrap",
  wordWrap: "normal",
  direction: "ltr",
  WebkitFontFeatureSettings: `"liga"`,
  WebkitFontSmoothing: "antialiased",
};

export function EquationToolbar({
  moveType,
  onMoveTypeChanged,
  canUndo,
  onUndoRequested,
  canRedo,
  onRedoRequested,
  canFlip,
  onFlipRelationRequested,
  canSubstitute,
  onSubstituteRequested,
  canFactor,
  onFactorRequested,
  canDistribute,
  onDistributeRequested,
  canCleanup,
  onCleanupRequested,
}: EquationToolbarProps) {
  return (
    <div
      style={{
        alignSelf: "flex-start",
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}
    >
      <div role="group" aria-label="Move mode" style={toolbarGroupStyle}>
        <button
          type="button"
          data-testid="move-mode-additive"
          aria-label="Additive move mode"
          title="Additive move mode"
          aria-pressed={moveType === "additive"}
          onClick={() => onMoveTypeChanged("additive")}
          style={{
            ...iconButtonBaseStyle,
            ...(moveType === "additive" ? iconButtonActiveStyle : {}),
            borderRightWidth: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M11 4a1 1 0 1 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6z"
            />
          </svg>
        </button>
        <button
          type="button"
          data-testid="move-mode-multiplicative"
          aria-label="Multiplicative move mode"
          title="Multiplicative move mode"
          aria-pressed={moveType === "multiplicative"}
          onClick={() => onMoveTypeChanged("multiplicative")}
          style={{
            ...iconButtonBaseStyle,
            ...(moveType === "multiplicative" ? iconButtonActiveStyle : {}),
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M6.7 5.3a1 1 0 0 0-1.4 1.4L10.6 12l-5.3 5.3a1 1 0 1 0 1.4 1.4L12 13.4l5.3 5.3a1 1 0 0 0 1.4-1.4L13.4 12l5.3-5.3a1 1 0 0 0-1.4-1.4L12 10.6z"
            />
          </svg>
        </button>
      </div>

      <div role="group" aria-label="Actions" style={toolbarGroupStyle}>
        <button
          type="button"
          data-testid="undo-equation-rewrite"
          aria-label="Undo"
          title="Undo"
          disabled={!canUndo}
          onClick={onUndoRequested}
          style={{
            ...iconButtonBaseStyle,
            borderRightWidth: 0,
            ...(!canUndo ? iconButtonDisabledStyle : {}),
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M9.7 6.3a1 1 0 0 1 0 1.4L7.4 10H15a5 5 0 1 1 0 10h-2a1 1 0 1 1 0-2h2a3 3 0 1 0 0-6H7.4l2.3 2.3a1 1 0 1 1-1.4 1.4l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 1.4 0z"
            />
          </svg>
        </button>
        <button
          type="button"
          data-testid="redo-equation-rewrite"
          aria-label="Redo"
          title="Redo"
          disabled={!canRedo}
          onClick={onRedoRequested}
          style={{
            ...iconButtonBaseStyle,
            borderRightWidth: 0,
            ...(!canRedo ? iconButtonDisabledStyle : {}),
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M14.3 6.3a1 1 0 0 0 0 1.4l2.3 2.3H9a5 5 0 1 0 0 10h2a1 1 0 1 0 0-2H9a3 3 0 1 1 0-6h7.6l-2.3 2.3a1 1 0 1 0 1.4 1.4l4-4a1 1 0 0 0 0-1.4l-4-4a1 1 0 0 0-1.4 0z"
            />
          </svg>
        </button>
        <button
          type="button"
          data-testid="flip-relation"
          aria-label="Flip relation"
          title="Flip relation"
          disabled={!canFlip}
          onClick={onFlipRelationRequested}
          style={{
            ...iconButtonBaseStyle,
            borderRightWidth: 0,
            ...(!canFlip ? iconButtonDisabledStyle : {}),
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M5 9a7 7 0 0 1 11.95-2.85L20 9"
            />
            <path
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M20 5v4h-4"
            />
            <path
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M7.5 14h9M7.5 17.5h9"
            />
          </svg>
        </button>
        <button
          type="button"
          data-testid="substitute-selection"
          aria-label="Substitute"
          title="Substitute"
          disabled={!canSubstitute}
          onClick={onSubstituteRequested}
          style={{
            ...iconButtonBaseStyle,
            ...(!canSubstitute ? iconButtonDisabledStyle : {}),
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <rect
              x="2.5"
              y="7"
              width="5.5"
              height="10"
              rx="1.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
              d="M10.5 12h3.5M12.5 10l2 2-2 2"
            />
            <rect
              x="16"
              y="7"
              width="5.5"
              height="10"
              rx="1.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
        </button>
      </div>

      <div role="group" aria-label="Automatic rewrites" style={toolbarGroupStyle}>
        <button
          type="button"
          data-testid="factor-selection"
          aria-label="Factor selection"
          title="Factor selection"
          disabled={!canFactor}
          onClick={onFactorRequested}
          style={{
            ...iconButtonBaseStyle,
            ...(!canFactor ? iconButtonDisabledStyle : {}),
          }}
        >
          <span style={materialSymbolStyle} aria-hidden="true">
            call_split
          </span>
        </button>
        <button
          type="button"
          data-testid="distribute-selection"
          aria-label="Distribute selection"
          title="Distribute selection"
          disabled={!canDistribute}
          onClick={onDistributeRequested}
          style={{
            ...iconButtonBaseStyle,
            ...(!canDistribute ? iconButtonDisabledStyle : {}),
          }}
        >
          <span style={materialSymbolStyle} aria-hidden="true">
            ramp_left
          </span>
        </button>
        <button
          type="button"
          data-testid="cleanup-selection"
          aria-label="Clean up selection"
          title="Clean up selection"
          disabled={!canCleanup}
          onClick={onCleanupRequested}
          style={{
            ...iconButtonBaseStyle,
            ...(!canCleanup ? iconButtonDisabledStyle : {}),
          }}
        >
          <img
            src="/icons/clean.svg"
            alt=""
            aria-hidden="true"
            style={{
              width: 22,
              height: 22,
              display: "block",
              filter: "invert(1)",
            }}
          />
        </button>
      </div>
    </div>
  );
}
