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
  onExpand: () => void;
  canExpand: boolean;
  onDeclareFunction: () => void;
  canDeclareFunction: boolean;
  onCancelTerm: () => void;
  canCancelTerm: boolean;
  onForceDelimiter: () => void;
  canForceDelimiter: boolean;
  onToggleDelimiterStyle: () => void;
  canToggleDelimiterStyle: boolean;
  onEvaluate: () => void;
  canEvaluate: boolean;
  onSimplify: () => void;
  canSimplify: boolean;
  onFactor: () => void;
  canFactor: boolean;
  onOpenApply: () => void;
  canApply: boolean;
  onOpenSubstitute: () => void;
  canSubstitute: boolean;
  onCopyLatex: () => void;
  canCopyLatex: boolean;
  onCopySelection: () => void;
  canCopySelection: boolean;
  onCopyHistory: () => void;
  canCopyHistory: boolean;
  copySelectionFeedback?: "idle" | "done";
  copyFeedback?: "idle" | "done";
  copyHistoryFeedback?: "idle" | "done";
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
    onExpand,
    canExpand,
    onDeclareFunction,
    canDeclareFunction,
    onCancelTerm,
    canCancelTerm,
    onForceDelimiter,
    canForceDelimiter,
    onToggleDelimiterStyle,
    canToggleDelimiterStyle,
    onEvaluate,
    canEvaluate,
    onSimplify,
    canSimplify,
    onFactor,
    canFactor,
    onOpenApply,
    canApply,
    onOpenSubstitute,
    canSubstitute,
    onCopyLatex,
    canCopyLatex,
    onCopySelection,
    canCopySelection,
    onCopyHistory,
    canCopyHistory,
    copySelectionFeedback = "idle",
    copyFeedback = "idle",
    copyHistoryFeedback = "idle",
    onEdit,
  },
  ref
) {
  const isCopyComplete = copyFeedback === "done";
  const isCopySelectionComplete = copySelectionFeedback === "done";
  const isCopyHistoryComplete = copyHistoryFeedback === "done";

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
        label="Expand selection"
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            open_in_full
          </span>
        }
        onClick={onExpand}
        disabled={!canExpand}
        testId="expand-button"
      />
      <IconButton
        label="Factor"
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            call_split
          </span>
        }
        onClick={onFactor}
        disabled={!canFactor}
        testId="factor-button"
      />
      <IconButton
        label="Declare function call"
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            functions
          </span>
        }
        onClick={onDeclareFunction}
        disabled={!canDeclareFunction}
        testId="declare-function-button"
      />
      <IconButton
        label="Cancel term"
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            backspace
          </span>
        }
        onClick={onCancelTerm}
        disabled={!canCancelTerm}
        testId="cancel-term-button"
      />
      <IconButton
        label="Force/Unforce parentheses"
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            data_object
          </span>
        }
        onClick={onForceDelimiter}
        disabled={!canForceDelimiter}
        testId="force-delimiter-button"
      />
      <IconButton
        label="Toggle delimiter style ( ) and [ ]"
        icon={
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M4 4h5v2H6v12h3v2H4zm11 0h5v16h-5v-2h3V6h-3z"
            />
          </svg>
        }
        onClick={onToggleDelimiterStyle}
        disabled={!canToggleDelimiterStyle}
        testId="toggle-delimiter-style-button"
      />
      <IconButton
        label="Evaluate"
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            calculate
          </span>
        }
        onClick={onEvaluate}
        disabled={!canEvaluate}
        testId="evaluate-button"
      />
      <IconButton
        label="Simplify"
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            auto_fix_high
          </span>
        }
        onClick={onSimplify}
        disabled={!canSimplify}
        testId="simplify-button"
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
        label={isCopyComplete ? "Copied!" : "Copy LaTeX"}
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            {isCopyComplete ? "check" : "content_copy"}
          </span>
        }
        onClick={onCopyLatex}
        disabled={!canCopyLatex}
        testId="copy-latex-button"
        tone={isCopyComplete ? "success" : "default"}
      />
      <IconButton
        label={isCopySelectionComplete ? "Selection copied!" : "Copy selection"}
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            {isCopySelectionComplete ? "check" : "content_copy"}
          </span>
        }
        onClick={onCopySelection}
        disabled={!canCopySelection}
        testId="copy-selection-button"
        tone={isCopySelectionComplete ? "success" : "default"}
      />
      <IconButton
        label={isCopyHistoryComplete ? "History copied!" : "Copy entire history"}
        icon={
          <span style={materialSymbolStyle} aria-hidden>
            {isCopyHistoryComplete ? "check" : "history"}
          </span>
        }
        onClick={onCopyHistory}
        disabled={!canCopyHistory}
        testId="copy-history-button"
        tone={isCopyHistoryComplete ? "success" : "default"}
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
