import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { EquationRow, type EquationRowCommands } from "./EquationRow";
import { UiIcon, type UiIconName } from "./icons/UiIcon";
import { usePadDocumentController } from "./pad/usePadDocumentController";
import type { PadEquation } from "./pad/padDocument";

const sideControlStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  padding: "4px",
  border: "1px solid #575757",
  borderRadius: "6px",
  background: "rgba(255, 255, 255, 0.03)",
  alignItems: "center",
  alignSelf: "center",
};
const PAD_ICON_BUTTON_STYLE: CSSProperties = {
  width: "32px",
  height: "32px",
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  border: "1px solid #757575",
  borderRadius: "6px",
  background: "#424242",
  color: "rgba(255, 255, 255, 0.87)",
  cursor: "pointer",
};

export type DerivationPadOptions = {
  wrapEquationCopiesInDisplayMath: boolean;
};

export type DerivationPadCommands = {
  insertLatex: (latex: string) => void;
  replaceEntryLatex: (latex: string) => void;
  acceptEntry: () => void;
  focusEntry: () => void;
};

export type DerivationPadEquationActionContext = {
  equation: Readonly<PadEquation>;
  index: number;
  isActive: boolean;
};

export type DerivationPadProps = {
  equations: PadEquation[];
  activeEquationId: string | null;
  options: DerivationPadOptions;
  onEquationsChange: (nextEquations: PadEquation[]) => void;
  onActiveEquationIdChange: (nextActiveEquationId: string | null) => void;
  onOptionsChange: (nextOptions: DerivationPadOptions) => void;
  renderEquationActions?: (
    context: DerivationPadEquationActionContext,
  ) => ReactNode;
  title?: string;
  description?: string;
};

type PadIconButtonProps = {
  label: string;
  icon: UiIconName;
  onClick: () => void;
  testId: string;
  disabled?: boolean;
};

function PadIconButton({ label, icon, onClick, testId, disabled = false }: PadIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...PAD_ICON_BUTTON_STYLE,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <UiIcon name={icon} size={21} />
    </button>
  );
}

export const DerivationPad = forwardRef<DerivationPadCommands, DerivationPadProps>(function DerivationPad(
  {
    equations,
    activeEquationId,
    options,
    onEquationsChange,
    onActiveEquationIdChange,
    onOptionsChange,
    renderEquationActions,
    title = "Pad",
    description = "Click an equation to make its shortcuts active.",
  },
  ref,
) {
  const equationCommandsByIdRef = useRef<Record<string, EquationRowCommands | null>>({});
  const controller = usePadDocumentController({
    equations,
    activeEquationId,
    wrapEquationCopiesInDisplayMath: options.wrapEquationCopiesInDisplayMath,
    onEquationsChange,
    onActiveEquationIdChange,
    onWrapEquationCopiesInDisplayMathChange: (wrapEquationCopiesInDisplayMath) => {
      onOptionsChange({ ...options, wrapEquationCopiesInDisplayMath });
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      insertLatex: (latex: string) => {
        if (!controller.activeEquationId) return;
        equationCommandsByIdRef.current[controller.activeEquationId]?.insertLatex(latex);
      },
      replaceEntryLatex: (latex: string) => {
        if (!controller.activeEquationId) return;
        equationCommandsByIdRef.current[controller.activeEquationId]?.replaceEntryLatex(latex);
      },
      acceptEntry: () => {
        if (!controller.activeEquationId) return;
        equationCommandsByIdRef.current[controller.activeEquationId]?.acceptEntry();
      },
      focusEntry: () => {
        if (!controller.activeEquationId) return;
        equationCommandsByIdRef.current[controller.activeEquationId]?.focusEntry();
      },
    }),
    [controller.activeEquationId],
  );

  return (
    <section
      className="pdp-ui"
      style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "stretch" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem" }}>{title}</h1>
          <div style={{ fontSize: "0.9rem", opacity: 0.75 }}>{description}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "0.9rem",
              color: "rgba(255, 255, 255, 0.82)",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              data-testid="wrap-equation-copy-display-math"
              checked={controller.wrapEquationCopiesInDisplayMath}
              onChange={(event) => controller.updateWrapEquationCopiesInDisplayMath(event.currentTarget.checked)}
            />
            Copy full equations with $$
          </label>
          <button
            type="button"
            data-testid="add-pad-equation"
            onMouseDown={(event) => event.preventDefault()}
            onClick={controller.addEquation}
            style={{
              boxSizing: "border-box",
              border: "1px solid #757575",
              borderRadius: "3px",
              background: "#424242",
              color: "rgba(255, 255, 255, 0.87)",
              padding: "8px 12px",
            }}
          >
            Add equation
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowX: "auto" }}>
        {controller.equations.map((equation, index) => {
          const isActive = controller.activeEquationId === equation.id;
          const isFirstEquation = index === 0;
          const isLastEquation = index === controller.equations.length - 1;
          const definitionSources = controller.getSubstituteSuggestionSources(equation.id);
          const hostActions = renderEquationActions?.({
            equation,
            index,
            isActive,
          });
          return (
            <article
              key={equation.id}
              data-testid="pad-equation"
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                padding: "8px",
                border: `1px solid ${isActive ? "#7c4dff" : "#575757"}`,
                borderRadius: "6px",
                background: isActive ? "rgba(124, 77, 255, 0.08)" : "rgba(255, 255, 255, 0.03)",
                minWidth: "1200px",
              }}
            >
              <div style={sideControlStyle}>
                <PadIconButton
                  label="Move equation up"
                  icon="arrow_upward"
                  onClick={() => controller.moveEquation(equation.id, -1)}
                  disabled={isFirstEquation}
                  testId="move-pad-equation-up"
                />
                <PadIconButton
                  label="Move equation down"
                  icon="arrow_downward"
                  onClick={() => controller.moveEquation(equation.id, 1)}
                  disabled={isLastEquation}
                  testId="move-pad-equation-down"
                />
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <EquationRow
                  ref={(commands) => {
                    equationCommandsByIdRef.current[equation.id] = commands;
                  }}
                  state={equation.state}
                  onStateChange={(rowUpdater) => {
                    controller.updateEquationState(equation.id, rowUpdater);
                  }}
                  onActivate={() => controller.activateEquation(equation.id)}
                  isActive={isActive}
                  mathFieldId={`equation-mathfield-${equation.id}`}
                  substituteSuggestionSources={definitionSources}
                  wrapEquationCopiesInDisplayMath={controller.wrapEquationCopiesInDisplayMath}
                />
                <span
                  style={{
                    fontSize: "0.8rem",
                    color: "rgba(255, 255, 255, 0.62)",
                    padding: "2px 6px",
                    borderRadius: "6px",
                    background: "rgba(255, 255, 255, 0.06)",
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                  }}
                >
                  ({index + 1})
                </span>
              </div>
              <div style={sideControlStyle}>
                {hostActions}
                <PadIconButton
                  label="Duplicate equation"
                  icon="content_copy"
                  onClick={() => controller.duplicateEquationAfter(equation.id)}
                  testId="duplicate-pad-equation"
                />
                <PadIconButton
                  label="Duplicate equation to end"
                  icon="vertical_align_bottom"
                  onClick={() => controller.duplicateEquationToEnd(equation.id)}
                  testId="duplicate-pad-equation-to-end"
                />
                <PadIconButton
                  label="Remove equation"
                  icon="delete"
                  onClick={() => controller.removeEquation(equation.id)}
                  testId="remove-pad-equation"
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
});
