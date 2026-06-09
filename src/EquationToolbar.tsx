import type { CSSProperties } from "react";
import type { IdentityRewriteOption } from "./math/rewrite/identity";
import type { MoveType } from "./math/rewrite/types";

type EquationToolbarProps = {
  moveType: MoveType;
  onMoveTypeChanged: (nextMoveType: MoveType) => void;
  canUndo: boolean;
  onUndoRequested?: () => void;
  canRedo: boolean;
  onRedoRequested?: () => void;
  canCopyEquation: boolean;
  onCopyEquationRequested: () => void;
  copyEquationFeedback: "idle" | "done";
  canCopySelection: boolean;
  onCopySelectionRequested: () => void;
  copySelectionFeedback: "idle" | "done";
  canFlip: boolean;
  onFlipRelationRequested: () => void;
  canSubstitute: boolean;
  onSubstituteRequested: () => void;
  canSubstituteAllMatches: boolean;
  onSubstituteAllMatchesRequested: () => void;
  canApplyOperation: boolean;
  onApplyOperationRequested: () => void;
  canFactor: boolean;
  onFactorRequested: () => void;
  canDistribute: boolean;
  onDistributeRequested: () => void;
  canCleanup: boolean;
  onCleanupRequested: () => void;
  canEvaluate: boolean;
  onEvaluateRequested: () => void;
  identityRewriteOptions: IdentityRewriteOption[];
  canApplyIdentityRewrite: boolean;
  onApplyDefaultIdentityRequested: () => void;
  onApplyIdentityRequested: (identityId: string) => void;
  canToggleNegate: boolean;
  onToggleNegateRequested: () => void;
  canToggleDelimiter: boolean;
  onToggleDelimiterRequested: () => void;
  canCycleDelimiter: boolean;
  onCycleDelimiterRequested: () => void;
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
  overflow: "visible",
};

const menuContainerStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
};

const menuSummaryStyle: CSSProperties = {
  ...iconButtonBaseStyle,
  listStyle: "none",
};

const menuPanelStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  zIndex: 10,
  minWidth: 260,
  padding: 6,
  border: "1px solid #757575",
  borderRadius: 4,
  background: "#303030",
  boxShadow: "0 8px 18px rgba(0, 0, 0, 0.35)",
};

const menuItemStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: 0,
  borderRadius: 3,
  background: "transparent",
  color: "rgba(255, 255, 255, 0.87)",
  cursor: "pointer",
  textAlign: "left",
};

const menuItemLabelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  lineHeight: 1.2,
};

const menuItemCaveatStyle: CSSProperties = {
  display: "block",
  marginTop: 3,
  color: "rgba(255, 255, 255, 0.62)",
  fontSize: 11,
  lineHeight: 1.25,
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
  canCopyEquation,
  onCopyEquationRequested,
  copyEquationFeedback,
  canCopySelection,
  onCopySelectionRequested,
  copySelectionFeedback,
  canFlip,
  onFlipRelationRequested,
  canSubstitute,
  onSubstituteRequested,
  canSubstituteAllMatches,
  onSubstituteAllMatchesRequested,
  canApplyOperation,
  onApplyOperationRequested,
  canFactor,
  onFactorRequested,
  canDistribute,
  onDistributeRequested,
  canCleanup,
  onCleanupRequested,
  canEvaluate,
  onEvaluateRequested,
  identityRewriteOptions,
  canApplyIdentityRewrite,
  onApplyDefaultIdentityRequested,
  onApplyIdentityRequested,
  canToggleNegate,
  onToggleNegateRequested,
  canToggleDelimiter,
  onToggleDelimiterRequested,
  canCycleDelimiter,
  onCycleDelimiterRequested,
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
          title="Additive move mode (A)"
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
          title="Multiplicative move mode (A)"
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
          title="Undo (Ctrl+Z)"
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
          title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
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
          data-testid="copy-equation-latex"
          aria-label={copyEquationFeedback === "done" ? "Equation copied" : "Copy equation"}
          title="Copy equation LaTeX (Ctrl+C)"
          disabled={!canCopyEquation}
          onClick={onCopyEquationRequested}
          style={{
            ...iconButtonBaseStyle,
            borderRightWidth: 0,
            ...(!canCopyEquation ? iconButtonDisabledStyle : {}),
          }}
        >
          <span style={materialSymbolStyle} aria-hidden="true">
            {copyEquationFeedback === "done" ? "check" : "content_copy"}
          </span>
        </button>
        <button
          type="button"
          data-testid="copy-selection-latex"
          aria-label={copySelectionFeedback === "done" ? "Selection copied" : "Copy selection"}
          title="Copy selection LaTeX (Ctrl+Shift+C)"
          disabled={!canCopySelection}
          onClick={onCopySelectionRequested}
          style={{
            ...iconButtonBaseStyle,
            borderRightWidth: 0,
            ...(!canCopySelection ? iconButtonDisabledStyle : {}),
          }}
        >
          <span style={materialSymbolStyle} aria-hidden="true">
            {copySelectionFeedback === "done" ? "check" : "content_copy"}
          </span>
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
          title="Substitute (S)"
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
        <button
          type="button"
          data-testid="substitute-all-matches"
          aria-label="Substitute all matching expressions"
          title="Substitute all matching expressions"
          disabled={!canSubstituteAllMatches}
          onClick={onSubstituteAllMatchesRequested}
          style={{
            ...iconButtonBaseStyle,
            borderLeftWidth: 0,
            ...(!canSubstituteAllMatches ? iconButtonDisabledStyle : {}),
          }}
        >
          <span style={materialSymbolStyle} aria-hidden="true">
            select_all
          </span>
        </button>
        <button
          type="button"
          data-testid="apply-operation"
          aria-label="Apply operation"
          title="Apply operation to relation or selected fraction (no shortcut)"
          disabled={!canApplyOperation}
          onClick={onApplyOperationRequested}
          style={{
            ...iconButtonBaseStyle,
            ...(!canApplyOperation ? iconButtonDisabledStyle : {}),
          }}
        >
          <span style={materialSymbolStyle} aria-hidden="true">
            functions
          </span>
        </button>
      </div>

      <div role="group" aria-label="Automatic rewrites" style={toolbarGroupStyle}>
        <button
          type="button"
          data-testid="factor-selection"
          aria-label="Factor selection"
          title="Factor selection (F)"
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
          title="Distribute selection (D)"
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
          title="Clean up selection (C)"
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
        <button
          type="button"
          data-testid="evaluate-selection"
          aria-label="Evaluate selection"
          title="Evaluate selection"
          disabled={!canEvaluate}
          onClick={onEvaluateRequested}
          style={{
            ...iconButtonBaseStyle,
            ...(!canEvaluate ? iconButtonDisabledStyle : {}),
          }}
        >
          <span style={materialSymbolStyle} aria-hidden="true">
            calculate
          </span>
        </button>
        <button
          type="button"
          data-testid="apply-default-identity"
          aria-label="Apply identity"
          title="Apply best identity (t)"
          disabled={!canApplyIdentityRewrite}
          onClick={onApplyDefaultIdentityRequested}
          style={{
            ...iconButtonBaseStyle,
            ...(!canApplyIdentityRewrite ? iconButtonDisabledStyle : {}),
          }}
        >
          <span style={materialSymbolStyle} aria-hidden="true">
            rule
          </span>
        </button>
        <details style={menuContainerStyle}>
          <summary
            role="button"
            aria-label="Choose identity"
            title="Choose identity"
            data-testid="identity-rewrite-menu"
            style={{
              ...menuSummaryStyle,
              ...(!canApplyIdentityRewrite ? iconButtonDisabledStyle : {}),
            }}
            onClick={(event) => {
              if (!canApplyIdentityRewrite) event.preventDefault();
            }}
          >
            <span style={materialSymbolStyle} aria-hidden="true">
              arrow_drop_down
            </span>
          </summary>
          <div role="menu" style={menuPanelStyle}>
            {identityRewriteOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                data-testid={`identity-rewrite-${option.id}`}
                onClick={(event) => {
                  onApplyIdentityRequested(option.id);
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }}
                style={menuItemStyle}
              >
                <span style={menuItemLabelStyle}>{option.label}</span>
                {option.caveat && <span style={menuItemCaveatStyle}>{option.caveat}</span>}
              </button>
            ))}
          </div>
        </details>
        <button
          type="button"
          data-testid="toggle-negate-selection"
          aria-label="Toggle negation"
          title="Toggle negation"
          disabled={!canToggleNegate}
          onClick={onToggleNegateRequested}
          style={{
            ...iconButtonBaseStyle,
            ...(!canToggleNegate ? iconButtonDisabledStyle : {}),
          }}
        >
          <span style={materialSymbolStyle} aria-hidden="true">
            exposure_neg_1
          </span>
        </button>
        <button
          type="button"
          data-testid="toggle-delimiter-selection"
          aria-label="Toggle delimiters"
          title="Toggle delimiters"
          disabled={!canToggleDelimiter}
          onClick={onToggleDelimiterRequested}
          style={{
            ...iconButtonBaseStyle,
            ...(!canToggleDelimiter ? iconButtonDisabledStyle : {}),
          }}
        >
          <span style={materialSymbolStyle} aria-hidden="true">
            data_object
          </span>
        </button>
        <button
          type="button"
          data-testid="cycle-delimiter-selection"
          aria-label="Cycle delimiter"
          title="Cycle delimiter"
          disabled={!canCycleDelimiter}
          onClick={onCycleDelimiterRequested}
          style={{
            ...iconButtonBaseStyle,
            ...(!canCycleDelimiter ? iconButtonDisabledStyle : {}),
          }}
        >
          <span style={materialSymbolStyle} aria-hidden="true">
            data_array
          </span>
        </button>
      </div>
    </div>
  );
}
