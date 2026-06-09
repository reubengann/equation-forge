import { useState } from "react";
import { EquationRow } from "./EquationRow";
import { createDraftEquationRowState, type EquationRowState } from "./EquationRowState";
import type { EquationEditorRecordingHooks } from "./TestRecorder";

const DEBUG_EQUATION_PRESETS = [
  String.raw`a+b=c`,
  String.raw`\frac{a}{b}+c`,
  String.raw`\int_0^1 x^2\,dx`,
  String.raw`\frac{\partial s}{\partial T}`,
  String.raw`F=ma`,
];

type EditorEntryToggleProps = {
  onLatexAccepted: (payload: {
    previousLatex: string | null;
    nextLatex: string;
  }) => void;
  onCanonicalLatexChanged?: (nextLatex: string) => void;
  recordingHooks?: EquationEditorRecordingHooks;
};

export function EditorEntryToggle({
  onLatexAccepted,
  onCanonicalLatexChanged,
  recordingHooks,
}: EditorEntryToggleProps) {
  const [rowState, setRowState] = useState<EquationRowState>(() =>
    createDraftEquationRowState(String.raw`a+b=c`),
  );

  return (
    <EquationRow
      state={rowState}
      onStateChange={(updater) => setRowState(updater)}
      onLatexAccepted={onLatexAccepted}
      onCanonicalLatexChanged={onCanonicalLatexChanged}
      recordingHooks={recordingHooks}
      presets={DEBUG_EQUATION_PRESETS}
      isActive
    />
  );
}

export default EditorEntryToggle;
