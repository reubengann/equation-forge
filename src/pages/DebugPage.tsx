import { type CSSProperties, useState } from "react";
import {
  ExpressionPad,
  type ExpressionPadDebugActions,
  type ExpressionPadDebugState,
} from "../ui/components/ExpressionPad";
import "../App.css";

const DEFAULT_EXAMPLES = [
  String.raw`\vec{F} = m \vec{a}`,
  String.raw`\exp x`,
  String.raw`\sin (x+y) + \cos x`,
  String.raw`\int_{0}^{5} x^2\,\mathrm{d}x`,
  String.raw`\dfrac{\partial f}{\partial x}`,
  String.raw`\dfrac{\differentialD f(x)}{\differentialD x}`,
  String.raw`\frac{a+b}{2}+c+d=e-f`,
  String.raw`x^2 + v_x = m a`,
  String.raw`\frac{d x}{d t} = v`,
  String.raw`\sum_{i=1}^{n} a_i = S`,
  String.raw`\vec{F} = m \vec{a}`,
];

const monoFont =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

const labelStyle: CSSProperties = { fontSize: 13, color: "var(--dp-muted)" };
const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--dp-border)",
  background: "var(--dp-surface)",
  color: "inherit",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  fontFamily: monoFont,
  boxSizing: "border-box",
};
const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 240,
  resize: "vertical",
};
const readonlyBoxStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 52,
  whiteSpace: "pre-wrap",
};
const fieldHalfStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: "calc(50% - 6px)",
};
const fieldFullStyle: CSSProperties = { ...fieldHalfStyle, width: "100%" };
const debugPanelStyle: CSSProperties = {
  marginTop: 18,
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
};
const gridStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
};
const miniGridStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

function DebugPanel(state: ExpressionPadDebugState) {
  return (
    <div style={debugPanelStyle}>
      <div style={fieldFullStyle}>
        <label htmlFor="dp-latex-text" style={labelStyle}>
          LaTeX
        </label>
        <input
          id="dp-latex-text"
          style={inputStyle}
          readOnly
          value={state.latexText}
          data-testid="info-text"
        />
      </div>

      <div style={fieldFullStyle}>
        <label htmlFor="dp-expression-json" style={labelStyle}>
          Expression Tree (MathJSON)
        </label>
        <textarea
          id="dp-expression-json"
          style={textareaStyle}
          readOnly
          value={state.expressionJsonText}
        />
      </div>

      <div style={gridStyle}>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Selection kind</label>
          <input
            style={inputStyle}
            readOnly
            value={state.selectionKind || "—"}
          />
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Clicked node id</label>
          <input
            style={inputStyle}
            readOnly
            value={state.selectionClickedId || "—"}
          />
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Selected node id</label>
          <input
            style={inputStyle}
            readOnly
            value={state.selectionSelectedId || "—"}
          />
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Node op</label>
          <input style={inputStyle} readOnly value={state.selectionOp || "—"} />
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Parent</label>
          <input
            style={inputStyle}
            readOnly
            value={state.selectionParent || "—"}
          />
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Range / span</label>
          <input
            style={inputStyle}
            readOnly
            value={state.selectionRange || "—"}
          />
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Child ids</label>
          <div style={readonlyBoxStyle}>{state.selectionChildIds || "—"}</div>
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Child ops</label>
          <div style={readonlyBoxStyle}>{state.selectionChildOps || "—"}</div>
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Child latex</label>
          <div style={readonlyBoxStyle}>{state.selectionChildLatex || "—"}</div>
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Node latex</label>
          <input
            style={inputStyle}
            readOnly
            value={state.selectionLatexDetail || "—"}
          />
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Node mathjson</label>
          <div style={readonlyBoxStyle}>{state.selectionJsonDetail || "—"}</div>
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Selection note</label>
          <div style={readonlyBoxStyle}>{state.selectionNote || "—"}</div>
        </div>
      </div>

      <div style={gridStyle}>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Move plan</label>
          <div style={readonlyBoxStyle}>{state.movePlanText || "—"}</div>
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Move plan (JSON)</label>
          <div style={readonlyBoxStyle} data-testid="info3-text">
            {state.info3 || "—"}
          </div>
        </div>
      </div>

      <div style={fieldFullStyle}>
        <label style={labelStyle}>Planner args</label>
        <textarea
          style={{ ...textareaStyle, minHeight: 140 }}
          readOnly
          value={state.infoArgs || "—"}
          data-testid="info-args"
        />
      </div>

      <div style={miniGridStyle}>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Previous hover target</label>
          <input style={inputStyle} readOnly value={state.dragStartInfo} />
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Hover drag</label>
          <input style={inputStyle} readOnly value={state.dragHoverInfo} />
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Drag slot</label>
          <input style={inputStyle} readOnly value={state.dragSlot} />
        </div>
        <div style={fieldHalfStyle}>
          <label style={labelStyle}>Parent Add</label>
          <input style={inputStyle} readOnly value={state.parentAddId} />
        </div>
      </div>
    </div>
  );
}

export function DebugPage() {
  const [exampleIdx, setExampleIdx] = useState(0);
  const [prefillLatex, setPrefillLatex] = useState<string | undefined>(undefined);
  const [prefillKey, setPrefillKey] = useState(0);

  function copyExampleIntoEditor() {
    const latex = DEFAULT_EXAMPLES[exampleIdx] ?? "";
    setPrefillLatex(latex);
    setPrefillKey((k) => k + 1);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ padding: 24, maxWidth: 1000 }}>
        <h2>Derivation Pad — Confirm Selection</h2>
        <label style={{ fontSize: 12, opacity: 0.8 }}>Examples (debug)</label>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            maxWidth: 720,
          }}
        >
          <select
            value={exampleIdx}
            onChange={(e) => setExampleIdx(Number(e.target.value))}
            style={{ padding: "6px 8px", borderRadius: 6, width: "100%" }}
            data-testid="examples-select"
          >
            {DEFAULT_EXAMPLES.map((ex, idx) => (
              <option key={idx} value={idx}>
                {ex}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={copyExampleIntoEditor}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--dp-border)",
              background: "var(--dp-surface)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            title="Copy selected example into the editor"
            data-testid="apply-example"
          >
            Copy
          </button>
        </div>
      </div>

      <ExpressionPad
        prefillLatex={prefillLatex}
        prefillKey={prefillKey}
        debug={{
          render: (
            state: ExpressionPadDebugState,
            _actions: ExpressionPadDebugActions
          ) => {
            void _actions;
            return <DebugPanel {...state} />;
          },
        }}
      />
    </div>
  );
}

export default DebugPage;
