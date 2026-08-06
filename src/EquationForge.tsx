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
import type { EquationCopySurroundMode } from "./copyLatex";

const sideControlStyle: CSSProperties = {
  display: "flex",
  flexShrink: 0,
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
  flexShrink: 0,
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

export type EquationForgeOptions = {
  copySurroundMode: EquationCopySurroundMode;
  showEquationNumbers: boolean;
};

export type EquationForgeCommands = {
  addEquation: () => void;
  setCopySurroundMode: (mode: EquationCopySurroundMode) => void;
  setShowEquationNumbers: (show: boolean) => void;
  insertLatex: (latex: string) => void;
  replaceEntryLatex: (latex: string) => void;
  acceptEntry: () => void;
  focusEntry: () => void;
};

export type EquationForgeEquationActionContext = {
  equation: Readonly<PadEquation>;
  index: number;
  isActive: boolean;
};

export type EquationForgeProps = {
  equations: PadEquation[];
  activeEquationId: string | null;
  options: EquationForgeOptions;
  onEquationsChange: (nextEquations: PadEquation[]) => void;
  onActiveEquationIdChange: (nextActiveEquationId: string | null) => void;
  onOptionsChange: (nextOptions: EquationForgeOptions) => void;
  renderEquationActions?: (
    context: EquationForgeEquationActionContext,
  ) => ReactNode;
  title?: string;
  description?: string;
  showHeader?: boolean;
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

export const EquationForge = forwardRef<EquationForgeCommands, EquationForgeProps>(function EquationForge(
  {
    equations,
    activeEquationId,
    options,
    onEquationsChange,
    onActiveEquationIdChange,
    onOptionsChange,
    renderEquationActions,
    title = "Equation Forge",
    description = "Click an equation to make its shortcuts active.",
    showHeader = true,
  },
  ref,
) {
  const equationCommandsByIdRef = useRef<Record<string, EquationRowCommands | null>>({});
  const controller = usePadDocumentController({
    equations,
    activeEquationId,
    copySurroundMode: options.copySurroundMode,
    onEquationsChange,
    onActiveEquationIdChange,
    onCopySurroundModeChange: (copySurroundMode) => {
      onOptionsChange({ ...options, copySurroundMode });
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      addEquation: controller.addEquation,
      setCopySurroundMode: (copySurroundMode) => {
        onOptionsChange({ ...options, copySurroundMode });
      },
      setShowEquationNumbers: (showEquationNumbers) => {
        onOptionsChange({ ...options, showEquationNumbers });
      },
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
    [controller, onOptionsChange, options],
  );

  return (
    <section
      className="equation-forge-ui"
      style={{
        width: "100%",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        alignItems: "stretch",
      }}
    >
      {showHeader ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "1.25rem" }}>{title}</h1>
            <div style={{ fontSize: "0.9rem", opacity: 0.75 }}>{description}</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
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
              Copy surround
              <select
                data-testid="equation-copy-surround-mode"
                value={controller.copySurroundMode}
                onChange={(event) =>
                  controller.updateCopySurroundMode(event.currentTarget.value as EquationCopySurroundMode)
                }
              >
                <option value="none">None</option>
                <option value="display-math">$$…$$</option>
                <option value="equation-environment">Equation environment</option>
              </select>
            </label>
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
                data-testid="show-equation-numbers"
                checked={options.showEquationNumbers}
                onChange={(event) =>
                  onOptionsChange({ ...options, showEquationNumbers: event.currentTarget.checked })
                }
              />
              Show equation numbers
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
      ) : null}

      <div style={{ display: "flex", minWidth: 0, flexDirection: "column", gap: "12px" }}>
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
                boxSizing: "border-box",
                width: "100%",
                minWidth: 0,
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
              <div
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
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
                  copySurroundMode={controller.copySurroundMode}
                  showAcceptButton={false}
                />
                {options.showEquationNumbers ? (
                  <span
                  style={{
                    fontSize: "0.8rem",
                    color: "rgba(255, 255, 255, 0.62)",
                    padding: "2px 6px",
                    borderRadius: "6px",
                    background: "rgba(255, 255, 255, 0.06)",
                    flexShrink: 0,
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                  }}
                  >
                    ({index + 1})
                  </span>
                ) : null}
              </div>
              <div style={sideControlStyle}>
                {hostActions}
                <PadIconButton
                  label={equation.state.mode === "display" ? "Edit equation" : "Accept equation"}
                  icon={equation.state.mode === "display" ? "edit" : "check"}
                  onClick={() => {
                    const commands = equationCommandsByIdRef.current[equation.id];
                    if (equation.state.mode === "display") commands?.focusEntry();
                    else commands?.acceptEntry();
                  }}
                  testId="accept-equation"
                />
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
