import React, { useReducer } from "react";
import { docReducer } from "./doc/reducer";
import type { DocState } from "./doc/model";
import { EquationView } from "./ui/EquationView";
import { printLatex } from "./semantics/printer";
import { parseEquationFromAsciiMath } from "./semantics/codec";

const initial: DocState = {
  current: parseEquationFromAsciiMath("a", "c - b"),
  steps: [],
};

export default function App() {
  const [state, dispatch] = useReducer(docReducer, initial);

  const L = state.current.left ? printLatex(state.current.left) : "a";
  const R = state.current.right ? printLatex(state.current.right) : "c - b";

  return (
    <div style={{ padding: 20, display: "grid", gap: 16 }}>
      <h2>Physics Derivation Pad</h2>

      <EquationView eqLatexLeft={L} eqLatexRight={R} dispatch={dispatch} />

      <div>
        <h3>History</h3>
        <ol>
          {state.steps.slice(0, 12).map(s => (
            <li key={s.id}>
              {printLatex(s.after.left)} = {printLatex(s.after.right)}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
