import React, { useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";
import { MathField } from "./MathField";
import type { Action, Side } from "../semantics/types";

type Props = {
  eqLatexLeft: string;
  eqLatexRight: string;
  dispatch: (a: Action) => void;
};

function getAscii(mf: MathfieldElement | null): string {
  return mf?.getValue("ascii-math")?.trim() ?? "";
}



type GetValueArg0 = Parameters<MathfieldElement["getValue"]>[0];
type GetValueArg1 = Parameters<MathfieldElement["getValue"]>[1];

function getAsciiAll(mf: MathfieldElement | null): string {
  return mf?.getValue("ascii-math")?.trim() ?? "";
}

function getAsciiSelectionOrAll(mf: MathfieldElement | null): string {
  if (!mf) return "";

  // Many MathLive builds expose a `.selection` object at runtime,
  // but the type defs vary. We grab it in a type-safe-ish way.
  const sel = (mf as any).selection as GetValueArg0 | undefined;

  if (sel) {
    try {
      const s = (mf.getValue as any)(sel, "ascii-math" as GetValueArg1);
      const trimmed = String(s ?? "").trim();
      if (trimmed) return trimmed;
    } catch {
      // ignore; fall back to whole field
    }
  }

  return getAsciiAll(mf);
}


export function EquationView({ eqLatexLeft, eqLatexRight, dispatch }: Props) {
  const leftRef = useRef<MathfieldElement | null>(null);
  const rightRef = useRef<MathfieldElement | null>(null);

  // These are editor buffers only; truth is in the doc state.
  const [editL, setEditL] = useState(eqLatexLeft);
  const [editR, setEditR] = useState(eqLatexRight);

  // keep editor buffers in sync when doc changes
  React.useEffect(() => setEditL(eqLatexLeft), [eqLatexLeft]);
  React.useEffect(() => setEditR(eqLatexRight), [eqLatexRight]);

  const moveAdditiveToLhsFrom = (from: Side) => {
    const mf = from === "lhs" ? leftRef.current : rightRef.current;
    const termAscii = getAsciiSelectionOrAll(mf);
    if (!termAscii) return;

    dispatch({ kind: "moveAdditiveToLhs", termLatex: termAscii, from, autoCancel: true });
    };

  const doCommitEdit = () => {
    dispatch({
      kind: "setEquation",
      latexLeft: getAscii(leftRef.current),
      latexRight: getAscii(rightRef.current),
    });
  };

  const addBothSidesFrom = (from: Side) => {
    const mf = from === "lhs" ? leftRef.current : rightRef.current;
    const termAscii = getAsciiSelectionOrAll(mf);
    if (!termAscii) return;

    dispatch({ kind: "addBothSides", termLatex: termAscii, from });
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
        <MathField latex={editL} onLatexChange={setEditL} mathfieldRef={leftRef} />
        <div style={{ fontSize: 20 }}>=</div>
        <MathField latex={editR} onLatexChange={setEditR} mathfieldRef={rightRef} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={doCommitEdit}>Commit edit</button>

        <button onClick={() => addBothSidesFrom("rhs")}>Add (selection on RHS) to both sides</button>
        <button onClick={() => dispatch({ kind: "cancelAdditivePairs", side: "rhs" })}>Cancel additive pairs (RHS)</button>
        <button onClick={() => moveAdditiveToLhsFrom("rhs")}>
            Move (additive) selection to LHS
        </button>
      </div>
    </div>
  );
}
