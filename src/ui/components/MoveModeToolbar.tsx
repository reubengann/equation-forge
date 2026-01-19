import { forwardRef, type CSSProperties } from "react";
import type { MoveMode } from "../../moveExpression/applyMove";
import { IconButton } from "./IconButton";

type MoveModeToolbarProps = {
  moveMode: MoveMode;
  onSetMoveMode: (mode: MoveMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onFlip: () => void;
  canFlip: boolean;
  onOpenApply: () => void;
  canApply: boolean;
  onOpenSubstitute: () => void;
  canSubstitute: boolean;
  onCopyLatex: () => void;
  canCopyLatex: boolean;
  onEdit: () => void;
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  padding: 4,
  // Match prior surface tone instead of flat black.
  background: "var(--dp-surface)",
  color: "var(--dp-toolbar-fg, inherit)",
  borderRadius: 12,
  border: "1px solid var(--dp-border)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
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

export const MoveModeToolbar = forwardRef<
  HTMLDivElement,
  MoveModeToolbarProps
>(function MoveModeToolbar(
  {
    moveMode,
    onSetMoveMode,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onFlip,
    canFlip,
    onOpenApply,
    canApply,
    onOpenSubstitute,
    canSubstitute,
    onCopyLatex,
    canCopyLatex,
    onEdit,
  },
  ref
) {
  return (
    <div style={toolbarStyle} ref={ref}>
      <IconButton
        label="Additive move mode"
        icon={
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M11 4a1 1 0 1 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6z"
            />
          </svg>
        }
        onClick={() => onSetMoveMode("additive")}
        active={moveMode === "additive"}
        testId="mode-additive"
      />
      <IconButton
        label="Multiplicative move mode"
        icon={
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M6.7 5.3a1 1 0 0 0-1.4 1.4L10.6 12l-5.3 5.3a1 1 0 1 0 1.4 1.4L12 13.4l5.3 5.3a1 1 0 0 0 1.4-1.4L13.4 12l5.3-5.3a1 1 0 0 0-1.4-1.4L12 10.6z"
            />
          </svg>
        }
        onClick={() => onSetMoveMode("multiplicative")}
        active={moveMode === "multiplicative"}
        testId="mode-multiplicative"
      />
      <IconButton
        label="Undo"
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            undo
          </span>
        }
        onClick={onUndo}
        disabled={!canUndo}
        testId="undo-button"
      />
      <IconButton
        label="Redo"
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            redo
          </span>
        }
        onClick={onRedo}
        disabled={!canRedo}
        testId="redo-button"
      />
      <IconButton
        label="Flip equation"
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            swap_horiz
          </span>
        }
        onClick={onFlip}
        disabled={!canFlip}
        testId="flip-button"
      />
      <IconButton
        label="Apply to both sides"
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            function
          </span>
        }
        onClick={onOpenApply}
        disabled={!canApply}
        testId="apply-button"
      />
      <IconButton
        label="Substitute"
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            move_down
          </span>
        }
        onClick={onOpenSubstitute}
        disabled={!canSubstitute}
        testId="substitute-button"
      />
      <IconButton
        label="Copy LaTeX"
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            content_copy
          </span>
        }
        onClick={onCopyLatex}
        disabled={!canCopyLatex}
        testId="copy-latex-button"
      />
      <IconButton
        label="Edit"
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            edit
          </span>
        }
        onClick={onEdit}
        testId="edit-button"
      />
    </div>
  );
});
